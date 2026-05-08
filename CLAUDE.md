# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Running the stack

```bash
./start.sh              # detect ngrok, smart-rebuild if sources changed, start all containers
./start.sh --build      # force rebuild both images then start
./start.sh --stop       # stop all containers
./start.sh --restart    # patch ngrok URL and restart containers (no rebuild)
./start.sh --logs       # tail all container logs
./start.sh --ngrok      # detect and print current ngrok URL only
```

**Ports:** frontend `3742` · backend API `8001` · postgres `5434` · redis `6382`

The backend code directory (`backend/app/`) is volume-mounted into the container and uvicorn runs with `--reload`, so Python changes take effect immediately without a rebuild. Frontend changes **do** require a rebuild.

### Backend (local, without Docker)

```bash
cd backend
make install       # uv sync --python 3.12
make dev           # uvicorn on :8080 with --reload
make worker        # ARQ background task worker
make migrate       # alembic upgrade head
make migration name="add_xyz"   # generate a new migration
make test          # pytest -v
```

### Frontend (local, without Docker)

```bash
cd frontend
npm install
npm run dev        # custom tsx server on :3000 (PORT env to change)
npm run build && npm run start   # production
npx tsc --noEmit   # type-check without building
```

---

## Architecture

### Top-level layout

```
docker-compose.yml   — single compose file for postgres, redis, backend, frontend
start.sh             — smart startup script (ngrok detection, selective rebuild)
backend/             — FastAPI + SQLAlchemy + ARQ
frontend/            — Next.js 15 App Router + custom WebSocket server
```

### Backend (`backend/app/`)

**Request path:** HTTP → `main.py` (FastAPI, middlewares) → routers → services/models

| Layer | Key files |
|---|---|
| Config | `config.py` — pydantic-settings; `public_url` property returns ngrok URL if set, else `base_url` |
| Auth | `routers/auth.py` — JWT (15 min access / 30 day refresh); `dependencies.py` — `get_current_user` Bearer dep |
| Routers | `agents`, `calls`, `campaigns`, `leads`, `phone_numbers`, `tools`, `analytics`, `settings`, `knowledge_base`, `webhooks` |
| Models | SQLAlchemy mapped classes in `models/`; all PKs are UUID strings |
| DB | `db/session.py` — async SQLAlchemy; `db/redis.py` — connection pool |
| Services | `elevenlabs_service.py`, `twilio_service.py`, `embedding_service.py`, `crm_service.py` |
| Tasks | ARQ worker (`tasks/worker.py`) runs `post_call_processing`, `dial_next_contact`, and three maintenance crons |
| Middlewares | `core/middleware.py` — `LoggingMiddleware` (every request) + `RateLimitMiddleware` (200 req/min, IP-keyed) |

**Live call path (the critical flow):**

1. Twilio dials out (or receives inbound) → calls `/api/v1/webhooks/twilio/twiml/{call_record_id}` to get TwiML
2. TwiML responds with `<Stream url="wss://…/ws/bridge/{call_record_id}">` pointing to the backend WebSocket
3. `websockets/bridge.py` — `Bridge` class — opens a WS to ElevenLabs simultaneously and relays μ-law audio in both directions
4. ElevenLabs sends `user_transcript` / `agent_response` / `client_tool_call` messages; the bridge handles all three
5. `client_tool_call` → `tools/executor.py` → `tools/registry.py` → individual tool handlers in `tools/tier1/` or `tools/tier2/`
6. Transcript entries are pushed to Redis (`call:{sid}:transcript` list) and emitted to `websockets/event_bus.py` for real-time frontend fan-out
7. On call end, `_finalize()` persists transcript + stages to the DB, then ARQ enqueues `post_call_processing`

**Tool system:**
- **Tier 1** (`tools/tier1/`): zero-latency client-side tools always active on every agent — `save_lead`, `get_contact_info`, `end_call`, `log_call_outcome`, `get_call_script`, `update_call_stage`
- **Tier 2** (`tools/tier2/`): optional server-side tools — `transfer_to_human`, `leave_voicemail` (and others configured in `AgentBuilder`)
- Tool IDs in `agent.enabled_tools` must exactly match the keys registered in `tools/registry.py`
- **IMPORTANT — EL tool types:** Tier 2 tools must be registered as `"webhook"` type in ElevenLabs (not `"client"`). In the native Twilio/EL integration there is no JS client, so `"client"` tools are silently dropped. See `elevenlabs_service.py` for how each tier-2 tool is registered.

**`transfer_to_human` tool — full flow:**
1. EL agent calls our webhook at `/api/v1/el/tools/transfer_to_human`
2. Tool reads the transfer number from `ctx.tool_configs["transfer_to_human"]["transfer_to"]` (configured per-agent, never passed as an LLM parameter)
3. Stamps Redis: `transferred=1`, `transferred_to`, `transfer_type`, `transfer_reason`, `transferred_at`
4. Builds TwiML `<Dial>` with:
   - `action` → `/twilio/transfer-fallback?call_record_id=...&transfer_to=...` (fires when dialed leg ends)
   - `recordingStatusCallback` → `/twilio/recording?call_record_id=...&is_transfer=1` (fires when recording is ready)
   - `record="record-from-answer"` — records the human-agent leg
5. POSTs to Twilio REST API (`/Calls/{call_sid}.json`) to redirect the live call; EL is immediately out of the loop
6. **Fallback** (`/twilio/transfer-fallback`): if human agent is busy/no-answer/failed → speaks a message and hangs up; if answered → `<Hangup/>` only
7. **Recording callback** (`/twilio/recording`): looks up call by `call_record_id` query param (the recording's `CallSid` is the dialed-leg SID, not the original); if `is_transfer=1` → enqueues `transcribe_human_leg` ARQ task (30s defer)
8. **`transcribe_human_leg` ARQ task** (`tasks/post_call_tasks.py`): downloads MP3 from Twilio, sends to OpenAI Whisper, appends `{"role": "human_agent", "text": "[Human Agent Conversation]\n..."}` to `call.transcript`
9. **`post_call_processing`** preserves `role: system` and `role: human_agent` entries when replacing transcript with fresh EL data — those entries do not exist in EL's transcript so they must be merged, not overwritten

**Transfer number configuration:** Set in agent tool_configs UI as `transfer_to_human.transfer_to` (E.164 format, e.g. `+15551234567`). The LLM never sees or guesses the number.

**Twilio webhooks — ngrok is required for local dev:**
- `settings.public_url` is the URL embedded in TwiML and status callbacks
- `start.sh` auto-detects the running ngrok tunnel (`localhost:4040/api/tunnels`) and patches `NGROK_URL` + `BASE_URL` in `backend/.env`
- In production, set `BASE_URL` to the real public domain; `NGROK_URL` stays empty

**Alembic:**
- Migrations live in `backend/alembic/versions/`
- `alembic upgrade head` runs automatically on container start via the docker-compose command
- The pgvector extension (`embedding VECTOR(1536)`) on `document_chunks` is not yet migrated — the knowledge-base endpoints exist but need `CREATE EXTENSION vector` and a migration before use

### Frontend (`frontend/`)

**Entry points:**
- `/` — marketing page (`app/page.tsx`)
- `/login` — auth page (`app/login/page.tsx`)
- `/dashboard` — full SPA (`app/dashboard/page.tsx`) — auth-guarded, all views rendered client-side via a `view` state switch

**SPA view routing** (no URL changes, all in `app/dashboard/page.tsx`):
`dashboard` → `DashboardView` | `agents` / `agent-builder` → `AgentBuilder` | `calls` → `CallLogView` | `campaigns` → `CampaignsView` | `analytics` → `AnalyticsView` | `tools` → `ToolsView` | `settings` → `SettingsView`

**Data layer:**
- `lib/api.ts` — typed fetch client; access token in module memory, refresh token in `localStorage`; auto-refresh on 401
- `lib/auth.tsx` — `AuthContext` / `useAuth()` — session restore on mount; dispatches `voxara:logout` event on token expiry
- `lib/hooks/` — React Query hooks wrapping `lib/api.ts` (`useAgents`, `useCalls`, `useCampaigns`, `useAnalytics`)
- `lib/hooks/useEventStream.ts` — WebSocket to `/ws/events/{user_id}`; auto-reconnects every 3 s; delivers `call_started`, `call_ended`, `transcript`, `call_processed` events

**Custom server:** `server.ts` runs via `tsx` (not `next start`). It layers a `ws.WebSocketServer` on the Next.js HTTP server to handle the frontend Twilio bridge at `/api/twilio/stream`. The `npm run start` script runs this file in production too.

**Styling:** All inline styles — no CSS framework. Design tokens: backgrounds `#080B14` / `#0C1120` / `#0F1623`, accent `#7C6EFA` / `#A89AF9`, cyan `#22D3EE`, green `#10B981`. Fonts: Syne (display), Inter (body), JetBrains Mono (numbers/code).

**TestCallPanel state machine:** `idle` → `calling` (after API call) → `connected` (on `call_started` WS event) → `ended` (on `call_ended` WS event). The `call_record_id` returned from `POST /calls/outbound` is used to filter events from the shared event stream.

---

## Key invariants

- **Single uvicorn worker** — WebSocket bridge state is in-process; do not run `--workers > 1` without sticky sessions
- **Redis as hot call context** — on the audio path, the bridge reads call context from `call:{call_record_id}` hash (no DB reads); Alembic must have run before first call
- **EL sync gate** — `POST /agents/{id}/sync` is blocked while any call is `in-progress` for that agent
- **DNC check** — applied at both `POST /calls/outbound` and in the `dial_next_contact` ARQ task
- **Agent signing secret** — all server-tool HTTP callbacks include `X-Voxara-Secret` validated against `agent.signing_secret`
- **`from datetime import datetime, timezone`** must be present in any Python file that constructs datetime objects
