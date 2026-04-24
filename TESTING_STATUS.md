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

### Twilio Integration
- [x] `POST /api/v1/calls/outbound` triggers real Twilio outbound call
- [x] Phone rings on `+923038532424` ✓ (user confirmed answer)
- [x] Twilio status callback fires → `answered_at` and `status=in-progress` saved in DB
- [x] TwiML webhook `GET /api/v1/webhooks/twilio/twiml/{call_id}` returns correct XML
- [x] TwiML `<Connect><Stream url="wss://...ngrok.../ws/bridge/{id}">` is syntactically correct

### WebSocket Layer
- [x] **Root cause of WebSocket 403 identified and fixed** (see below)
- [x] `GET /ws/bridge/{id}` now returns `101 Switching Protocols` (verified via ngrok inspector)
- [x] `GET /ws/events/{user_id}` endpoint registered and accepts connections
- [x] WebSocket accessible through ngrok: `wss://...ngrok.../ws/bridge/probe-ngrok → 101`

### Code Quality
- [x] Pydantic v2 `ResponseValidationError` fixed in all 6 schema files (`created_at: datetime` not `str`)
- [x] Comprehensive docstrings added to all 93 route handlers
- [x] `TwilioService` production-hardened: persistent client, smart retry (skip 4xx), idempotency keys, structured error parsing, logging

---

## 🐛 Bug Fixed This Session

### WebSocket 403 – Root Cause & Fix

**Symptom:** Every WebSocket connection returned `HTTP 403 Forbidden` regardless of path, origin, or auth headers.

**Root cause:** Both WebSocket handler functions in `backend/app/main.py` had `websocket` parameters with **no type annotation**. Without `WebSocket` as the type, FastAPI's dependency injection treated `websocket` as a required query parameter, failed validation, and closed the connection with code `1008` — which uvicorn surfaced as HTTP 403.

```python
# BEFORE (broken)
@app.websocket("/ws/bridge/{call_record_id}")
async def ws_bridge(call_record_id: str, websocket):   # ← no type!

# AFTER (fixed)
@app.websocket("/ws/bridge/{call_record_id}")
async def ws_bridge(call_record_id: str, websocket: WebSocket):  # ← typed
```

**Files changed:** `backend/app/main.py` — added `WebSocket` import and type annotations to both `ws_bridge` and `ws_events`.

---

## ❌ Not Yet Working / Needs Investigation

### 1. Agent Does Not Speak on Call — HIGH PRIORITY

**Observed:** Call rings, user answers, silence for a few seconds, call drops. Agent never speaks.

**What we know:**
- Twilio fetches TwiML ✓ (logged: `POST /webhooks/twilio/twiml/... 200 OK`)
- TwiML contains `<Connect><Stream url="wss://...ngrok.../ws/bridge/{id}">` ✓
- WebSocket endpoint now accepts connections ✓ (confirmed post-fix)
- BUT: **no WebSocket connection from Twilio appears in backend logs** after TwiML is served
- Twilio call ends with `duration: 0` and status `completed`
- ngrok inspector shows TwiML POST but **no WebSocket upgrade** from Twilio

**Most likely causes to investigate (in order):**

| # | Suspected Cause | How to Verify |
|---|---|---|
| 1 | `track="both_tracks"` attribute on `<Connect><Stream>` is invalid (only valid on `<Start><Stream>`) | Remove `track` attribute from TwiML and retest |
| 2 | Twilio cannot reach the ngrok WebSocket URL from their servers | Test from external IP / Twilio helper |
| 3 | Redis call context is empty when bridge loads it (key expires or wrong key lookup) | Check Redis for key `call:{call_record_id}` after call is placed |
| 4 | Bridge fails early (before logging) due to an import or startup exception | Add try/except around `bridge.run()` with explicit error logging |

**Next fix to try:** Remove `track="both_tracks"` from TwiML — this attribute is only defined for `<Start><Stream>` (unidirectional), not `<Connect><Stream>` (bidirectional). Twilio may reject or ignore TwiML with unknown attributes on `<Connect><Stream>`.

```python
# backend/app/utils/twiml.py — change:
<Stream url="{ws_url}" track="both_tracks">
# to:
<Stream url="{ws_url}">
```

### 2. `ended_at` Never Set on Call Records — MEDIUM

**Observed:** Calls remain `status=in-progress` in the DB even after Twilio marks them `completed`. `ended_at` is NULL.

**Cause:** The Twilio status callback at `POST /api/v1/webhooks/twilio/status` is responsible for updating final status. Either:
- The bridge `_finalize()` method is never reached (because the bridge never starts)
- The status callback is not received / not updating `ended_at`

**Impact:** Dashboard will show all calls as "in-progress" forever.

### 3. ElevenLabs Key Lacks `user_read` Scope — LOW

**Observed:** `GET /v1/user` returns 401. The key works for all ConvAI endpoints but cannot fetch account/billing info.

**Impact:** Any route that calls ElevenLabs user endpoint will fail. Currently not used by the app, but worth noting if billing/usage features are added.

### 4. Agent `status` Field Is Null — LOW

**Observed:** `POST /api/v1/agents` returns `"status": null`.

**Cause:** The `Agent` model may not have a `status` column, or the schema maps it incorrectly.

**Impact:** Frontend may not render agent status badges correctly.

---

## 📋 Call Flow Summary (Current State)

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
   <Connect><Stream url="wss://...ngrok.../ws/bridge/{id}" track="both_tracks">
   
[Twilio] Should open WebSocket to wss://...ngrok.../ws/bridge/{id}
   ↓ ← THIS STEP IS NOT HAPPENING — no WS connection logged

[Backend] Bridge should:
   ↓ accept() WebSocket
   ↓ receive Twilio "connected" + "start" events
   ↓ load call context from Redis
   ↓ connect to ElevenLabs wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...
   ↓ relay audio bidirectionally
   ↓ agent speaks ← NEVER REACHED
```

---

## 🧪 Test Calls Placed

| # | Call ID | Twilio SID | To | Status | Duration | Outcome |
|---|---------|------------|-----|--------|----------|---------|
| 1 | `a7cc3ffc` | `CA40ba3b43` | +923038532424 | in-progress (stale) | — | 403 WS (old bug) |
| 2 | `273ad398` | `CA20fadba2` | +923038532424 | in-progress (stale) | — | 403 WS (old bug) |
| 3 | `841323d1` | `CAd79bb32c` | +923038532424 | in-progress (stale) | 0s | TwiML served, WS not initiated by Twilio |

---

## 🗂 Key Files Changed This Session

| File | What Changed |
|------|-------------|
| `backend/app/main.py` | Added `WebSocket` type annotation to `ws_bridge` and `ws_events` — **fixes 403** |
| `backend/app/schemas/agent.py` | `created_at`/`updated_at`: `str` → `datetime` — fixes agent save 500 error |
| `backend/app/schemas/call.py` | Same datetime fix |
| `backend/app/schemas/campaign.py` | Same datetime fix |
| `backend/app/schemas/lead.py` | Same datetime fix |
| `backend/app/schemas/tool.py` | Same datetime fix |
| `backend/app/schemas/phone_number.py` | Same datetime fix |
| `backend/app/services/elevenlabs_service.py` | TTS model: `eleven_turbo_v2_5` → `eleven_turbo_v2` |
| `backend/app/services/twilio_service.py` | Production hardening: persistent client, smart retry, idempotency, logging |
| `backend/app/tools/tier1/*.py` | Added `description` to all tool parameter properties (ElevenLabs requirement) |
| `backend/app/tools/tier2/transfer_to_human.py` | Same description fix |
| `backend/app/routers/*.py` | Expert-level docstrings on all 93 route handlers |

---

## 🔧 Immediate Next Steps

1. **Fix TwiML** — remove `track="both_tracks"` from `<Connect><Stream>` in `backend/app/utils/twiml.py`
2. **Retest call** — place fresh call to +923038532424 and confirm Twilio opens WebSocket
3. **Verify bridge logs** — confirm `bridge_start`, `bridge_el_connected` appear in backend logs
4. **Fix `ended_at`** — ensure Twilio status callback correctly marks calls completed
5. **Fix agent `status` null** — check Agent model / schema for status field
