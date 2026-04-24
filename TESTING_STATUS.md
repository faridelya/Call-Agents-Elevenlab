# Voxara – Testing Status & Fix Tracker
**Last updated:** 2026-04-25  
**Branch:** `test-and-fix`

---

## ✅ What Is Working

### Infrastructure
- [x] Docker stack starts cleanly (`./start.sh`)
- [x] PostgreSQL reachable on port 5434, migrations run on container start
- [x] Redis reachable on port 6382, ping returns PONG
- [x] ngrok tunnel active: `https://6ceb-175-107-226-205.ngrok-free.app → localhost:8001`
- [x] Backend health endpoint: `GET /health → 200 OK`
- [x] Frontend loads on port 3742

### Authentication & API
- [x] `POST /api/v1/auth/register` — creates user, returns JWT pair
- [x] `POST /api/v1/auth/login` — returns access + refresh tokens
- [x] JWT Bearer auth on all protected routes
- [x] `GET /api/v1/agents` — lists agents (empty on fresh account)
- [x] `POST /api/v1/agents` — creates agent AND syncs to ElevenLabs ConvAI in one step
- [x] `GET /api/v1/phone-numbers` — returns list (empty until purchased)
- [x] `POST /api/v1/calls/outbound` — places call, creates DB record, pre-seeds Redis, returns 201

### ElevenLabs Integration
- [x] API key is valid for ConvAI endpoints (`/v1/convai/agents`)
- [x] Agent created on ElevenLabs: `agent_6801kq0k6avzfzwb13psr0bg5ys5`
- [x] Model fixed from `eleven_turbo_v2_5` → `eleven_turbo_v2` (English agents require turbo/flash v2)
- [x] All tier-1 and tier-2 tool parameter properties have `description` field (ElevenLabs requirement)
- [x] Agent audio format patched to `ulaw_8000` (both input/output) via ElevenLabs PATCH API
- [x] Agent `first_message` set: "Hello! This is a test call from Voxara AI. Can you hear me clearly?"

### Twilio Integration
- [x] `POST /api/v1/calls/outbound` triggers real Twilio outbound call
- [x] Phone rings on `+923038532424` ✓ (user confirmed answer)
- [x] Twilio status callback fires → `answered_at` and `status=in-progress` saved in DB
- [x] TwiML webhook `GET /api/v1/webhooks/twilio/twiml/{call_id}` returns correct XML
- [x] TwiML `<Connect><Stream url="wss://...ngrok.../ws/bridge/{id}">` is correct (no invalid `track` attribute)

### WebSocket Layer
- [x] `GET /ws/bridge/{id}` returns `101 Switching Protocols`
- [x] `GET /ws/events/{user_id}` endpoint registered and accepts connections
- [x] WebSocket accessible through ngrok

### Full Call Flow — ALL WORKING ✅
- [x] Call rings on `+923038532424`
- [x] User answers → Twilio fetches TwiML
- [x] Twilio opens WebSocket to `/ws/bridge/{call_record_id}`
- [x] Bridge accepts WebSocket, loads Redis context
- [x] Bridge connects to ElevenLabs `wss://api.elevenlabs.io/v1/convai/conversation`
- [x] Agent speaks first message immediately
- [x] Audio relay works bidirectionally (Twilio μ-law 8kHz ↔ ElevenLabs ulaw_8000)
- [x] User transcript logged in real-time
- [x] Agent responses logged in real-time
- [x] Call ends cleanly → transcript saved to DB, status set to `completed`, `ended_at` recorded

### Code Quality
- [x] Pydantic v2 `ResponseValidationError` fixed in all 6 schema files (`created_at: datetime` not `str`)
- [x] Comprehensive docstrings added to all 93 route handlers
- [x] `TwilioService` production-hardened: persistent client, smart retry (skip 4xx), idempotency keys, structured error parsing, logging

---

## 🐛 Bugs Fixed This Session

### Bug 1: WebSocket 403
**Cause:** `ws_bridge` and `ws_events` functions had untyped `websocket` parameter; FastAPI treated it as a required query param and rejected connections.  
**Fix:** Added `WebSocket` type annotation.

### Bug 2: TwiML `track="both_tracks"` — PRIMARY CALL BUG
**Cause:** `<Connect><Stream>` does not support the `track` attribute (only `<Start><Stream>` does). Twilio rejected or ignored TwiML and never opened the WebSocket.  
**Fix:** Removed `track="both_tracks"` from `backend/app/utils/twiml.py`.

### Bug 3: Wrong Audio Format — AGENT SILENT
**Cause:** ElevenLabs agent was configured for `pcm_16000` audio but Twilio streams μ-law 8kHz (`ulaw_8000`). Audio was unintelligible in both directions.  
**Fix:** Patched agent via ElevenLabs REST API to set `user_input_audio_format: ulaw_8000` and `agent_output_audio_format: ulaw_8000`.  
*Also corrected `build_agent_config` in `elevenlabs_service.py` which already had `ulaw_8000` in STT config — the agent just hadn't been re-synced.*

### Bug 4: Wrong Audio Message Key in Bridge
**Cause:** Bridge code used `msg.get("audio", {}).get("chunk", "")` but ElevenLabs API sends `msg["audio_event"]["audio_base_64"]`.  
**Fix:** `backend/app/websockets/bridge.py` — corrected to `msg.get("audio_event", {}).get("audio_base_64", "")`.

### Bug 5: Wrong `client_tool_call` Parsing
**Cause:** Bridge accessed `msg.get("tool_name")` at top level, but ElevenLabs nests it: `msg["client_tool_call"]["tool_name"]`.  
**Fix:** `backend/app/websockets/bridge.py` — `tool_data = msg.get("client_tool_call", msg)` with fallback.

### Bug 6: `ended_at` / `status` Never Updated by Bridge
**Cause:** `_finalize()` set `ended_at` but not `status`. Calls would remain `in-progress` in the DB.  
**Fix:** `_finalize()` now sets `status = "completed"` when it was `in-progress`.

---

## 📋 Call Flow Summary (Current Working State)

```
[API] POST /calls/outbound
   ↓ creates Call record in DB
   ↓ writes call context to Redis: call:{call_record_id}
   ↓ POST Twilio API → Twilio dials +923038532424
   ↓ returns 201 with call_record_id

[Twilio] Phone rings on +923038532424
   ↓ User answers
   ↓ Twilio POSTs to /api/v1/webhooks/twilio/twiml/{call_record_id}

[Backend] TwiML endpoint returns:
   <Connect><Stream url="wss://...ngrok.../ws/bridge/{id}">

[Twilio] Opens WebSocket to wss://...ngrok.../ws/bridge/{id}
   ↓ Sends "connected" + "start" events

[Backend Bridge]
   ↓ accept() WebSocket
   ↓ receives Twilio "connected" + "start" events → extracts call_sid/stream_sid
   ↓ loads call context from Redis (call:{call_sid})
   ↓ connects to ElevenLabs wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...
   ↓ sends conversation_initiation_client_data with lead dynamic variables
   ↓ ElevenLabs sends audio for first_message → relayed to Twilio
   ↓ agent speaks ✅
   ↓ user speaks → μ-law audio chunks relayed to ElevenLabs
   ↓ transcripts logged to Redis and DB in real-time
   ↓ on call end: transcript + status saved to DB, Redis cleaned up
```

---

## 🧪 Test Calls Placed

| # | Call ID | Twilio SID | To | Status | Duration | Outcome |
|---|---------|------------|-----|--------|----------|---------|
| 1 | `a7cc3ffc` | `CA40ba3b43` | +923038532424 | in-progress (stale) | — | 403 WS (old bug) |
| 2 | `273ad398` | `CA20fadba2` | +923038532424 | in-progress (stale) | — | 403 WS (old bug) |
| 3 | `841323d1` | `CAd79bb32c` | +923038532424 | in-progress (stale) | 0s | TwiML served, WS not initiated (track bug) |
| 4 | `9a7eba09` | `CAcfaf870b` | +923038532424 | **completed** ✅ | ~1min | **FULL CALL WORKED** — agent spoke, user replied, transcript saved |

---

## 🗂 Key Files Changed This Session

| File | What Changed |
|------|-------------|
| `backend/app/main.py` | Added `WebSocket` type annotation to `ws_bridge` and `ws_events` — **fixes 403** |
| `backend/app/utils/twiml.py` | Removed `track="both_tracks"` from `<Connect><Stream>` — **fixes Twilio not opening WS** |
| `backend/app/websockets/bridge.py` | Fixed audio key (`audio_event.audio_base_64`), fixed `client_tool_call` nesting, fixed `_finalize()` setting `status=completed` |
| `backend/app/schemas/agent.py` | `created_at`/`updated_at`: `str` → `datetime` |
| `backend/app/schemas/call.py` | Same datetime fix |
| `backend/app/schemas/campaign.py` | Same datetime fix |
| `backend/app/schemas/lead.py` | Same datetime fix |
| `backend/app/schemas/tool.py` | Same datetime fix |
| `backend/app/schemas/phone_number.py` | Same datetime fix |
| `backend/app/services/elevenlabs_service.py` | TTS model: `eleven_turbo_v2_5` → `eleven_turbo_v2` |
| `backend/app/services/twilio_service.py` | Production hardening |
| `backend/app/tools/tier1/*.py` | Added `description` to all tool parameter properties |
| ElevenLabs agent (via API) | Audio format `pcm_16000` → `ulaw_8000` (input + output), `first_message` set |

---

## ❌ Remaining Known Issues

### 1. Agent `status` Field Is Null — LOW
**Observed:** `POST /api/v1/agents` returns `"status": null`.  
**Cause:** The `Agent` SQLAlchemy model has no `status` column. The `AgentResponse` schema also has no `status` field. The frontend may be expecting it from a different API shape.  
**Impact:** Frontend status badges may not render. Functionally calls work fine.

### 2. ElevenLabs Key Lacks `user_read` Scope — LOW
**Observed:** `GET /v1/user` returns 401. The key works for all ConvAI endpoints.  
**Impact:** Any billing/usage info endpoints will fail. Not currently used by the app.

### 3. Stale `in-progress` Calls from Old Tests — COSMETIC
**Observed:** Calls `a7cc3ffc`, `273ad398`, `841323d1` remain `in-progress` with no `ended_at`.  
**Fix when needed:** `UPDATE calls SET status='failed', ended_at=NOW()::text WHERE ended_at IS NULL AND id IN (...)`

### 4. `duration_seconds` Not Set by Bridge — LOW
**Cause:** `_finalize()` does not compute duration. The Twilio status callback sets it from `CallDuration`, but only for calls where the callback fires.  
**Impact:** Duration column stays NULL for bridge-terminated calls.

---

## 🔧 Next Steps (Optional Improvements)

1. **Persist `first_message` in DB** — update `Agent` model and ElevenLabs sync to always use the agent's `first_message` field
2. **Add `status` to Agent model/schema** — expose `is_active` as `status` in the response schema  
3. **Compute `duration_seconds` in `_finalize()`** — calculate from `started_at` → `ended_at`
4. **Add `build_agent_config` ulaw sync test** — create a new agent and verify it gets `ulaw_8000` automatically
