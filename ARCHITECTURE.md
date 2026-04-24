# Voxara — Architecture Overview

> Stack: Next.js 15.3 · React 19 · TypeScript · ElevenLabs Conversational AI · Twilio Media Streams  
> Entry point: `server.ts` (custom HTTP + WebSocket server wrapping Next.js)

---

## Directory Map

```
AI Voice Agent Elevenlab/
├── server.ts                          ← Custom HTTP + WS server (replaces `next dev`)
├── lib/
│   ├── elevenlabs-twilio-bridge.ts    ← Core audio bridge (Twilio ↔ ElevenLabs)
│   └── twilio.ts                      ← Twilio SDK client + URL helpers
├── app/
│   ├── layout.tsx                     ← Root layout, Google fonts, CSS variables
│   ├── globals.css                    ← Design tokens (colors, spacing, animations)
│   ├── page.tsx                       ← Marketing website (/)
│   ├── dashboard/page.tsx             ← App dashboard (/dashboard)
│   └── api/twilio/
│       ├── inbound/route.ts           ← POST webhook — returns TwiML for inbound calls
│       ├── outbound/route.ts          ← POST endpoint — initiates outbound calls
│       └── status/route.ts            ← POST webhook — call status events
├── components/
│   ├── website/                       ← Marketing site components
│   │   ├── NavHeader.tsx
│   │   ├── Hero.tsx                   ← Animated live-call demo (waveform + transcript)
│   │   ├── Features.tsx               ← Feature cards + How It Works steps
│   │   ├── Integrations.tsx           ← ElevenLabs/Twilio tab switcher + code block
│   │   ├── Pricing.tsx                ← 3-tier pricing + social proof + CTA
│   │   ├── Footer.tsx
│   │   └── shared.tsx                 ← WaveLogo, Btn, SectionLabel, SectionHeading
│   └── app/                           ← Dashboard app components
│       ├── AppShell.tsx               ← 220px sidebar, nav items, user avatar
│       ├── Dashboard.tsx              ← StatCards + AgentCard grid (exports Agent type)
│       ├── AgentBuilder.tsx           ← Config / Tools / Voice / Test Call tabs
│       ├── CallLog.tsx                ← Call table + transcript detail side panel
│       ├── Analytics.tsx              ← Bar chart + 4 stat cards
│       ├── Tools.tsx                  ← ElevenLabs + Twilio setup modals
│       ├── Campaigns.tsx              ← Campaign rows with progress bars
│       └── Settings.tsx               ← Workspace / Voice Infrastructure / Billing
├── public/
│   ├── logo.svg
│   └── logo-icon.svg
├── .env.local.example                 ← Template for required env vars
└── package.json
```

---

## Backend Architecture

### Request Flow

```
Browser / Twilio
      │
      ▼
server.ts  (Node.js HTTP server, port $PORT)
      │
      ├─── HTTP requests ──────────────────────► Next.js handler
      │                                              ├── GET /          → marketing page
      │                                              ├── GET /dashboard → app page
      │                                              ├── POST /api/twilio/inbound  → TwiML
      │                                              ├── POST /api/twilio/outbound → call init
      │                                              └── POST /api/twilio/status   → status log
      │
      └─── WS upgrade on /api/twilio/stream ──► handleTwilioStream()
                                                      │
                                                      ├── Receives Twilio Media Stream events
                                                      │     connected → start → media* → stop
                                                      │
                                                      └── Opens wss://api.elevenlabs.io/v1/convai/conversation
                                                                │
                                                                ├── Sends conversation_initiation_client_data
                                                                │     (tts.output_format: ulaw_8000)
                                                                │
                                                                ├── Receives conversation_initiation_metadata
                                                                │     → marks ready=true, flushes audioQueue
                                                                │
                                                                ├── Twilio media.payload → user_audio_chunk
                                                                ├── ElevenLabs audio → Twilio media event
                                                                ├── ElevenLabs interruption → Twilio clear
                                                                └── ElevenLabs ping → pong
```

### Audio Format Chain

```
Caller mic
  → Twilio PCMU µ-law 8kHz mono base64
  → bridge: user_audio_chunk (same base64)
  → ElevenLabs processes speech
  → ElevenLabs ulaw_8000 base64 response
  → bridge: Twilio media event (payload)
  → Caller hears AI agent
```

### Key Files — Backend

| File | Responsibility |
|------|---------------|
| `server.ts` | Layers `ws` WebSocketServer on Next.js HTTP server. Intercepts `/api/twilio/stream` upgrades; destroys all other WS upgrade attempts. |
| `lib/elevenlabs-twilio-bridge.ts` | One function `handleTwilioStream(ws, metadata)`. Owns both WS connections and all audio relay logic. Audio is buffered in `audioQueue[]` (max 200 chunks) until ElevenLabs init completes. |
| `lib/twilio.ts` | `twilioClient` (SDK), `streamUrl()` (https→wss conversion), `webhookUrl(path)`. All three API routes import from here. |
| `app/api/twilio/inbound/route.ts` | Returns TwiML `<Connect><Stream>` when Twilio calls the webhook on inbound calls. |
| `app/api/twilio/outbound/route.ts` | Accepts `{ to, agentId?, systemPrompt? }` JSON. Calls `twilioClient.calls.create()` with inline TwiML. Returns `{ callSid, status }`. |
| `app/api/twilio/status/route.ts` | Receives formData `CallSid`, `CallStatus`, `CallDuration`. Logs to console only. Returns empty `<Response/>`. |

### Environment Variables

| Variable | Where Used |
|----------|-----------|
| `ELEVENLABS_API_KEY` | `lib/elevenlabs-twilio-bridge.ts` — WS header `xi-api-key` |
| `ELEVENLABS_AGENT_ID` | `lib/elevenlabs-twilio-bridge.ts` — WS query param `agent_id` |
| `TWILIO_ACCOUNT_SID` | `lib/twilio.ts` — SDK init |
| `TWILIO_AUTH_TOKEN` | `lib/twilio.ts` — SDK init |
| `TWILIO_PHONE_NUMBER` | `lib/twilio.ts` — outbound `from` number |
| `NEXT_PUBLIC_BASE_URL` | `lib/twilio.ts` — builds WSS + webhook URLs injected into TwiML |
| `PORT` | `server.ts` — HTTP server listen port (default 3000) |

---

## Frontend Architecture

### Routing

| URL | Component | State |
|-----|-----------|-------|
| `/` | `app/page.tsx` → website components | Static |
| `/dashboard` | `app/dashboard/page.tsx` → view router | Client-only |

### Dashboard View Router (`app/dashboard/page.tsx`)

```
AppShell (sidebar)
  │
  └── view state: 'dashboard' | 'agents' | 'campaigns' | 'calls' | 'analytics'
                             | 'tools' | 'settings' | 'agent-builder'
        │
        ├── dashboard    → DashboardView    (stat cards + agent grid)
        ├── agent-builder→ AgentBuilder     (config/tools/voice/test tabs)
        ├── calls        → CallLogView      (table + transcript panel)
        ├── analytics    → AnalyticsView    (bar charts + metrics)
        ├── tools        → ToolsView        (ElevenLabs + Twilio setup modals)
        ├── campaigns    → CampaignsView    (campaign list + progress)
        └── settings     → SettingsView     (workspace / billing)
```

### Component Inventory — Website

| Component | Description |
|-----------|-------------|
| `NavHeader` | Sticky nav, blurs on scroll, links to dashboard |
| `Hero` | Headline + animated `LiveDemo` (waveform bars, rotating transcript) |
| `Features` | 6 feature cards + 4-step How It Works |
| `Integrations` | ElevenLabs / Twilio tab switcher with syntax-highlighted code block |
| `Pricing` | Starter / Growth / Enterprise tiers + social proof bar + CTA |
| `Footer` | 4-column footer with links |
| `shared` | `WaveLogo`, `Btn`, `SectionLabel`, `SectionHeading` |

### Component Inventory — App

| Component | Key Props / State | Data Source |
|-----------|------------------|-------------|
| `AppShell` | `active`, `onNav` | Static nav items |
| `DashboardView` | `onSelectAgent(agent)` | `sampleAgents[]` — hardcoded |
| `AgentBuilder` | `agent`, `onBack` | Props + local state |
| `CallLogView` | — | `callLogs[]` — hardcoded |
| `AnalyticsView` | — | Hardcoded bar chart data |
| `ToolsView` | — | Static integration list + modals |
| `CampaignsView` | — | Hardcoded campaign rows |
| `SettingsView` | — | Hardcoded static display |

### Design Tokens (globals.css)

| Token | Value |
|-------|-------|
| Background | `#080B14` |
| Surface | `#0F1623` |
| Brand violet | `#7C6EFA` |
| Brand cyan | `#22D3EE` |
| Success | `#10B981` |
| Danger | `#EF4444` |
| Warning | `#F59E0B` |
| Text primary | `#F1F5F9` |
| Text muted | `#475569` |
| Fonts | Space Grotesk, Syne, Inter, JetBrains Mono |

---

## What Needs to Be Fixed / Integrated

### Critical — Not Wired Up

| # | Item | Where | What's Missing |
|---|------|--------|---------------|
| 1 | **AgentBuilder → Save** | `AgentBuilder.tsx:134` | "Save" button has no handler — state is never persisted |
| 2 | **AgentBuilder → Go Live** | `AgentBuilder.tsx:150` | "Go Live" calls nothing — should call `POST /api/twilio/outbound` or toggle agent status |
| 3 | **AgentBuilder → Test Call** | `AgentBuilder.tsx:522` | "Initiate Test Call" button calls nothing — should POST to `/api/twilio/outbound` with test number |
| 4 | **Outbound call from dashboard** | `Dashboard.tsx:205` | "+ New Agent" button has no action |
| 5 | **Real agent list** | `Dashboard.tsx:22-27` | `sampleAgents[]` is hardcoded — no API to load/create/update agents |
| 6 | **Real call logs** | `CallLog.tsx:17-25` | `callLogs[]` is hardcoded — no API to fetch call history |
| 7 | **Real analytics** | `Analytics.tsx` | Bar chart data is hardcoded — no API to fetch metrics |
| 8 | **Tools setup modals** | `Tools.tsx` | ElevenLabs and Twilio setup modals don't save or validate credentials |
| 9 | **Campaigns** | `Campaigns.tsx` | Entirely hardcoded — no create/start/stop |
| 10 | **Settings save** | `Settings.tsx` | All fields are read-only display — no save action |

### Backend — Missing Features

| # | Item | Notes |
|---|------|-------|
| 11 | **No database / persistence layer** | All data is in-memory or hardcoded. Need a DB (e.g. SQLite, Postgres, Supabase) for agents, calls, settings |
| 12 | **No authentication** | Dashboard is publicly accessible with no login gate |
| 13 | **Call transcript storage** | Bridge logs transcripts to console only (`console.log`). Should persist to DB per call |
| 14 | **`agentId` override in outbound** | `outbound/route.ts` accepts `agentId` in body but the bridge currently only reads `ELEVENLABS_AGENT_ID` env var — the query-string `agentId` is passed to `handleTwilioStream` but unused in the WS URL |
| 15 | **`systemPrompt` override** | Bridge supports `callMetadata?.systemPrompt` in `conversation_initiation_client_data` but `outbound/route.ts` does not forward it to the stream URL query string |
| 16 | **No Twilio signature validation** | Inbound/status webhooks don't validate `X-Twilio-Signature` — a security gap in production |
| 17 | **Status events not stored** | `status/route.ts` logs but doesn't update call records in any store |
| 18 | **Voice selection** | AgentBuilder Voice tab lets user pick a voice but this is never sent to ElevenLabs |

### Frontend — UI/UX Issues

| # | Item | Notes |
|---|------|-------|
| 19 | **Phone number in AgentBuilder is hardcoded** | Shows `+1 (555) 014-8823` — should come from `TWILIO_PHONE_NUMBER` via an API route |
| 20 | **Test number in AgentBuilder is hardcoded** | Shows `+1 (555) 999-0000` — should be a real configurable number |
| 21 | **Agent status toggle** | Status (live/idle/paused) is static — no button to start/stop an agent |
| 22 | **Date in Dashboard is hardcoded** | Shows `Monday, April 21, 2025` — should be `new Date()` |
| 23 | **No loading/error states** | No spinners or error messages anywhere in the app |
| 24 | **No mobile layout** | All layouts use fixed px widths and CSS grids without responsive breakpoints |

---

## How to Run

```bash
# 1. Copy and fill env vars
cp .env.local.example .env.local

# 2. Install
npm install

# 3. Dev server (WebSocket + Next.js)
PORT=3100 npm run dev

# 4. Expose for Twilio webhooks
ngrok http 3100
# → set NEXT_PUBLIC_BASE_URL=https://<ngrok>.ngrok-free.app in .env.local
# → restart dev server after updating .env.local

# 5. Configure Twilio phone number
# Inbound:  https://<ngrok>/api/twilio/inbound  (POST)
# Status:   https://<ngrok>/api/twilio/status   (POST)
```

```bash
# Trigger outbound call (test)
curl -X POST http://localhost:3100/api/twilio/outbound \
  -H "Content-Type: application/json" \
  -d '{"to": "+15551234567"}'
```

---

## Suggested Integration Order

1. Fix `agentId` + `systemPrompt` forwarding in bridge (#14, #15) — unlocks per-agent config
2. Wire "Initiate Test Call" button to `POST /api/twilio/outbound` (#3)
3. Add a minimal persistence layer (JSON file or SQLite) for agents and call records (#11)
4. Connect AgentBuilder Save/Go Live to the store (#1, #2)
5. Fetch real call logs + analytics from store (#6, #7)
6. Add Twilio signature validation (#16)
7. Add auth (NextAuth or similar) to gate the dashboard (#12)
