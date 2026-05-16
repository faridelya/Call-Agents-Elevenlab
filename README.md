# Voxara — AI Voice Agent Platform

An AI-powered outbound/inbound voice agent SaaS built on ElevenLabs Conversational AI and Twilio. Agents make and receive phone calls, execute tools in real-time during live calls, run automated dialing campaigns, and deliver post-call AI summaries — all managed through a Next.js dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Voice AI | ElevenLabs Conversational AI |
| Telephony | Twilio (Programmable Voice + Streaming) |
| Backend | FastAPI + SQLAlchemy (async) + ARQ |
| Database | PostgreSQL 17 + pgvector |
| Cache / Queue | Redis 7 |
| Frontend | Next.js 15 (App Router) + custom WebSocket server |
| Transcription | ElevenLabs STT (human-leg recordings) |
| Auth | JWT (15 min access / 30 day refresh) |

---

## Features

- **Live AI voice calls** — ElevenLabs agent audio streamed through Twilio via a WebSocket bridge
- **Real-time tool execution** — agents call tools mid-conversation (look up contacts, log outcomes, transfer to human, leave voicemail, etc.)
- **Campaign dialer** — bulk outbound campaigns with DNC enforcement, concurrency limits, and per-contact retry logic
- **Post-call processing** — AI-generated call summaries, outcome classification, and transcript storage
- **Human transfer** — warm transfer with recording of the human-agent leg, transcribed by ElevenLabs STT and merged into the call record
- **Knowledge base** — attach documents to agents (vector embeddings via pgvector)
- **Custom tools** — build webhook tools, MCP-connected tools, or configure native ElevenLabs tools from the UI
- **Event streaming** — real-time call events pushed to the dashboard via WebSocket fan-out
- **Analytics** — call volume, success rate, average duration, campaign performance

---

## Project Structure

```
.
├── docker-compose.yml        # All services (postgres, redis, backend, worker, frontend)
├── start.sh                  # Smart startup script (ngrok detection, selective rebuild)
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, lifespan, middlewares
│   │   ├── config.py         # Pydantic-settings (reads backend/.env)
│   │   ├── dependencies.py   # Auth dependency (get_current_user)
│   │   ├── routers/          # agents, calls, campaigns, leads, tools, analytics, webhooks …
│   │   ├── models/           # SQLAlchemy models (UUID PKs)
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # elevenlabs_service, twilio_service, embedding_service
│   │   ├── tasks/            # ARQ worker: post_call_processing, dial_next_contact, maintenance crons
│   │   ├── tools/
│   │   │   ├── tier1/        # Always-on client tools: save_lead, get_contact_info, end_call, log_call_outcome, get_call_script, update_call_stage
│   │   │   ├── tier2/        # Optional server tools: transfer_to_human, leave_voicemail
│   │   │   ├── registry.py   # Tool loader — maps tool IDs to handlers
│   │   │   └── executor.py   # Dispatches client_tool_call events from ElevenLabs
│   │   ├── websockets/
│   │   │   ├── bridge.py     # Twilio ↔ ElevenLabs audio relay (Bridge class)
│   │   │   └── event_bus.py  # Fan-out of call events to frontend WebSocket clients
│   │   ├── core/
│   │   │   └── middleware.py # LoggingMiddleware + RateLimitMiddleware (200 req/min)
│   │   └── db/
│   │       ├── session.py    # Async SQLAlchemy engine & session factory
│   │       └── redis.py      # Redis connection pool
│   ├── alembic/              # Database migrations
│   └── Makefile              # Local dev helpers (install, dev, worker, migrate, test)
└── frontend/
    ├── app/
    │   ├── page.tsx          # Marketing / landing page
    │   ├── login/page.tsx    # Auth page
    │   └── dashboard/page.tsx # Main SPA (all views rendered client-side)
    ├── components/app/       # AgentBuilder, CallLog, Dashboard, Campaigns, Analytics, Settings …
    ├── lib/
    │   ├── api.ts            # Typed fetch client with auto token-refresh
    │   ├── auth.tsx          # AuthContext / useAuth()
    │   ├── hooks/            # React Query hooks (useAgents, useCalls, useCampaigns …)
    │   └── hooks/useEventStream.ts  # WebSocket client — auto-reconnects every 3s
    └── server.ts             # Custom tsx server: Next.js + WebSocket layer on one port
```

---

## Prerequisites

- Docker + Docker Compose
- [ngrok](https://ngrok.com/) (required for local Twilio webhooks)
- ElevenLabs account + API key
- Twilio account + phone number
- OpenAI API key _( — for LLM use in Elevenlab Agent; can use Google Gemini or Anthropic Claude instead)_

---

## Quick Start

### 1. Install & authenticate ngrok

Twilio needs a public HTTPS URL to reach your local backend. ngrok provides this tunnel.

1. Download ngrok from https://ngrok.com/download and put it on your `PATH`
2. Sign up for a free account at https://dashboard.ngrok.com
3. Copy your authtoken from the ngrok dashboard and run:

```bash
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
```

> **Why this matters:** `start.sh` automatically starts ngrok and patches the tunnel URL into `backend/.env`. If the authtoken is not configured, ngrok will fail silently and Twilio webhooks will not work.

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Fill in `backend/.env`:

```env
# ── App ───────────────────────────────────────────────────────────────────────
APP_ENV=development          # set to "production" in prod
SECRET_KEY=your-random-secret

# Auto-patched by start.sh from the running ngrok tunnel — do not set manually in dev
NGROK_URL=
BASE_URL=http://localhost:8001

# ── Database & Cache ──────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://voxara:voxara_dev@localhost:5432/voxara
REDIS_URL=redis://localhost:6379/0

# ── ElevenLabs ────────────────────────────────────────────────────────────────
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_BASE_URL=https://api.elevenlabs.io/v1   # default; only change for enterprise
ELEVENLABS_WEBHOOK_SECRET=   # set after creating the post-call webhook in EL console

# ── Twilio ────────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...    # default outbound caller ID (E.164)

# ── LLM providers (for post-call summaries & outcome classification) ──────────
# At least one key is required. ElevenLabs STT handles all voice transcription —
# these keys are only used for text LLM calls (summaries, classification, etc.)
OPENAI_API_KEY=sk-...        # OpenAI GPT models
GOOGLE_API_KEY=              # Google Gemini models (optional)
ANTHROPIC_API_KEY=           # Anthropic Claude models (optional)

# ── Encryption ────────────────────────────────────────────────────────────────
# Fernet key for encrypting stored user credentials — generate once:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=

# ── Auth token lifetimes ──────────────────────────────────────────────────────
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# ── Campaign dialing safety limits ───────────────────────────────────────────
CAMPAIGN_GLOBAL_MAX_CONCURRENT=10   # max simultaneous campaign calls platform-wide
CAMPAIGN_MIN_INTERVAL_SECONDS=3     # min seconds between consecutive dials in a campaign
CAMPAIGN_BACKOFF_SECONDS=30         # back-off when concurrency ceiling is hit
CAMPAIGN_DEBUG=false                # set to true for verbose campaign pipeline logs
```

### 3. First run — build images and start everything

```bash
./start.sh --build
```

This will:
1. Detect (or auto-start) ngrok and patch the tunnel URL into `backend/.env`
2. Build the Docker images for the backend and frontend
3. Start all containers (postgres, redis, backend, ARQ worker, frontend)
4. Run `alembic upgrade head` automatically inside the backend container

After the first build, subsequent starts are faster:

```bash
./start.sh          # smart-rebuild only if source files changed, then start
```

`start.sh` auto-patches `NGROK_URL` and `BASE_URL` in `backend/.env` from the running ngrok tunnel.

| Service | URL |
|---|---|
| Frontend | http://localhost:3742 |
| Backend API | http://localhost:8001 |
| API Docs | http://localhost:8001/docs |
| PostgreSQL | localhost:5434 |
| Redis | localhost:6382 |

### 4. Register & log in

Open http://localhost:3742, create an account, and start building agents.

---

## Start Script Reference

```bash
./start.sh              # detect ngrok, smart-rebuild if sources changed, start all containers
./start.sh --build      # force rebuild both images then start
./start.sh --stop       # stop all containers
./start.sh --restart    # patch ngrok URL and restart containers (no rebuild)
./start.sh --logs       # tail all container logs
./start.sh --ngrok      # detect and print current ngrok URL only
```

---

## Local Development (without Docker)

### Backend

```bash
cd backend
make install       # uv sync --python 3.12
make migrate       # alembic upgrade head
make dev           # uvicorn on :8001 with --reload
make worker        # ARQ background task worker (separate terminal)
make test          # pytest -v
make migration name="add_xyz"   # generate a new migration
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # custom tsx server on :3000 (PORT env to change)
npm run build && npm run start   # production mode
npx tsc --noEmit   # type-check
```

---

## Live Call Flow

```
Twilio dials out / receives inbound
  → GET /api/v1/webhooks/twilio/twiml/{call_record_id}   (TwiML response)
  → TwiML: <Stream url="wss://<ngrok>/ws/bridge/{call_record_id}">
  → websockets/bridge.py — Bridge opens WS to ElevenLabs simultaneously
  → Audio relayed in both directions (μ-law, base64)
  → ElevenLabs emits:
      user_transcript   → pushed to Redis + event bus
      agent_response    → pushed to Redis + event bus
      client_tool_call  → tools/executor.py → registry → tier1/tier2 handlers
  → On call end: transcript + stages persisted to DB
  → ARQ enqueues post_call_processing (AI summary, outcome classification)
```

---

## Tool System

### Tier 1 — Always-on client tools (zero latency)

| Tool | Description |
|---|---|
| `save_lead` | Capture and upsert lead info from conversation |
| `get_contact_info` | Pull CRM contact data into agent context |
| `end_call` | Hang up the call programmatically |
| `log_call_outcome` | Record outcome/disposition mid-call |
| `get_call_script` | Fetch the agent's active script |
| `update_call_stage` | Advance the call through pipeline stages |

### Tier 2 — Optional server-side webhook tools

| Tool | Description |
|---|---|
| `transfer_to_human` | Warm transfer to a configured phone number; records and transcribes the human-agent leg |
| `leave_voicemail` | Drop a pre-recorded or TTS voicemail |

### Custom tools (AgentBuilder UI)

- **Webhook** — POST to any HTTPS endpoint with custom auth, headers, and body params
- **MCP** — Connect to a Model Context Protocol server (SSE or HTTP Streamable transport)

---

## Key Environment Variables

| Variable | Description | Default |
|---|---|---|
| `APP_ENV` | `development` or `production` | `development` |
| `SECRET_KEY` | JWT signing secret | _(required)_ |
| `BASE_URL` | Public URL of this backend — auto-patched by start.sh in dev | `http://localhost:8001` |
| `NGROK_URL` | ngrok tunnel URL — auto-patched by start.sh; leave empty in production | `""` |
| `DATABASE_URL` | PostgreSQL async URL | local postgres |
| `REDIS_URL` | Redis connection URL | local redis |
| `ELEVENLABS_API_KEY` | ElevenLabs API key — used for voice AI and STT transcription | _(required)_ |
| `ELEVENLABS_BASE_URL` | ElevenLabs API base URL | `https://api.elevenlabs.io/v1` |
| `ELEVENLABS_WEBHOOK_SECRET` | Verifies EL post-call webhook HMAC signatures | `""` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | _(required)_ |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | _(required)_ |
| `TWILIO_PHONE_NUMBER` | Default outbound caller ID (E.164) | _(required)_ |
| `OPENAI_API_KEY` | OpenAI key — used for LLM summaries/classification (not transcription) | `""` |
| `GOOGLE_API_KEY` | Google Gemini key — alternative LLM provider for post-call processing | `""` |
| `ANTHROPIC_API_KEY` | Anthropic Claude key — alternative LLM provider for post-call processing | `""` |
| `ENCRYPTION_KEY` | Fernet key for encrypting stored user credentials | _(required)_ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT access token lifetime | `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | JWT refresh token lifetime | `30` |
| `CAMPAIGN_GLOBAL_MAX_CONCURRENT` | Hard cap on simultaneous campaign calls platform-wide | `10` |
| `CAMPAIGN_MIN_INTERVAL_SECONDS` | Minimum seconds between consecutive dials in a campaign | `3` |
| `CAMPAIGN_BACKOFF_SECONDS` | Seconds to back off when the concurrency ceiling is hit | `30` |
| `CAMPAIGN_DEBUG` | Enable verbose campaign pipeline logs | `false` |

---

## Architecture Notes

- **Single uvicorn worker** — WebSocket bridge state is in-process; do not run `--workers > 1` without sticky sessions
- **Redis as hot call context** — the audio bridge reads call state from `call:{call_record_id}` hash with no DB round-trips
- **EL sync gate** — agent sync to ElevenLabs is blocked while any call is `in-progress` for that agent
- **DNC enforcement** — applied at both `POST /calls/outbound` and inside the `dial_next_contact` ARQ task
- **Agent signing secret** — all tier-2 HTTP callbacks include `X-Voxara-Secret` validated against `agent.signing_secret`
- **Migrations** — `alembic upgrade head` runs automatically on container start
