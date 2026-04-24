Ready to code?                                                                                    
                                                                                                   
 Here is Claude's plan:                                                                            
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Voxara FastAPI Backend — Professional Architecture Plan                                           
                                                        
 Context                                                                                           

 The existing system is a Next.js 15 frontend (fully designed, all data hardcoded) connected to a
 bare-bones Node.js WebSocket bridge that proxies audio between Twilio and ElevenLabs. The goal is
  to build a production-grade FastAPI backend that gives the SaaS real functionality: agent
 management, call handling, a tool execution engine, campaign management, and a lead database —
 all wired to ElevenLabs Conversational AI and Twilio telephony.

 This is an outbound and inbound sales call SaaS. Users create AI voice agents, configure them for
  specific sales missions, run bulk outbound campaigns, or assign agents to inbound phone lines.

 ---
 Architecture Overview

 ┌─────────────────────────────────────────────────────────┐
 │              Next.js 15 Frontend (Voxara)                │
 │  AgentBuilder → REST calls → FastAPI                     │
 └───────────────────────┬─────────────────────────────────┘
                         │ REST + WS
 ┌───────────────────────▼─────────────────────────────────┐
 │                  FastAPI Backend                          │
 │                                                          │
 │  Auth │ Agents │ Calls │ Campaigns │ Leads │ Analytics  │
 │                                                          │
 │  ┌──────────────────────────────────────────────────┐   │
 │  │           WebSocket Bridge                       │   │
 │  │  Twilio WS ←→ Bridge ←→ ElevenLabs WS           │   │
 │  │       Tool calls dispatched here (Tier 1)        │   │
 │  └──────────────────────────────────────────────────┘   │
 │                                                          │
 │  ┌──────────────────────────────────────────────────┐   │
 │  │       Server Tool HTTP Endpoints (Tier 2/3)      │   │
 │  │   /tools/book_meeting  /tools/send_sms  etc.     │   │
 │  └──────────────────────────────────────────────────┘   │
 │                                                          │
 │  ARQ Worker: post-call processing, campaign dialing      │
 └────────────┬──────────────┬──────────────┬──────────────┘
              ▼              ▼              ▼
         PostgreSQL       Redis        ElevenLabs + Twilio
         (pgvector)   (call state)       (external APIs)

 ---
 Tool System Design

 Key Decision: Hybrid Client + Server Tools

 Client tools (bridge handles ElevenLabs client_tool_call WS events):
 - Used for Tier 1 — latency-critical operations that need call context
 - Bridge has call_sid → agent_config, user_id, lead_data in Redis; responds in <10ms
 - No extra HTTP round-trip

 Server tools (ElevenLabs calls our FastAPI HTTP endpoints):
 - Used for Tier 2/3 — external API calls, async workflows
 - ElevenLabs sends POST /tools/{tool_name} with X-Voxara-Secret header
 - Each endpoint validates the secret, fetches agent config, executes

 ---
 Tier 1 — MUST-HAVE (Client Tools, every agent, always active)

 ┌───────────────────┬──────────────────────────────────────────────────┬─────────────────────┐
 │       Tool        │                    Parameters                    │       Purpose       │
 ├───────────────────┼──────────────────────────────────────────────────┼─────────────────────┤
 │                   │                                                  │ Capture/upsert      │
 │ save_lead         │ first_name, last_name, email, phone, company,    │ contact info        │
 │                   │ title, notes, custom_fields                      │ gathered during     │
 │                   │                                                  │ call → leads table  │
 ├───────────────────┼──────────────────────────────────────────────────┼─────────────────────┤
 │                   │                                                  │ Fetch existing lead │
 │ get_contact_info  │ phone_number (optional), email (optional)        │  + call history     │
 │                   │                                                  │ before/during call  │
 ├───────────────────┼──────────────────────────────────────────────────┼─────────────────────┤
 │                   │                                                  │ Terminates call via │
 │ end_call          │ reason (enum), summary                           │  Twilio REST,       │
 │                   │                                                  │ triggers post-call  │
 │                   │                                                  │ ARQ task            │
 ├───────────────────┼──────────────────────────────────────────────────┼─────────────────────┤
 │                   │                                                  │ Writes outcome to   │
 │ log_call_outcome  │ outcome (enum), notes, next_action,              │ calls table, queues │
 │                   │ follow_up_date                                   │  follow-up if date  │
 │                   │                                                  │ set                 │
 ├───────────────────┼──────────────────────────────────────────────────┼─────────────────────┤
 │                   │                                                  │ Returns script      │
 │ get_call_script   │ section                                          │ section from Redis  │
 │                   │ (opener/discovery/pitch/objection/closing/faq)   │ call context        │
 │                   │                                                  │ (sub-ms)            │
 ├───────────────────┼──────────────────────────────────────────────────┼─────────────────────┤
 │                   │                                                  │ Appends to stage    │
 │ update_call_stage │ stage (enum), duration_seconds                   │ timeline in Redis   │
 │                   │                                                  │ for analytics       │
 └───────────────────┴──────────────────────────────────────────────────┴─────────────────────┘

 Outcome enum: interested, not_interested, callback_scheduled, voicemail_left, wrong_number,
 do_not_call

 ---
 Tier 2 — Optional Built-in Tools (user enables per-agent)

 ┌─────────────────────┬────────┬───────────────────────────────────────┬─────────────────────┐
 │        Tool         │  Type  │             What it does              │    Config needed    │
 ├─────────────────────┼────────┼───────────────────────────────────────┼─────────────────────┤
 │ book_meeting        │ Server │ Books meeting via                     │ Calendar provider + │
 │                     │        │ Cal.com/Calendly/Google Calendar      │  API key            │
 ├─────────────────────┼────────┼───────────────────────────────────────┼─────────────────────┤
 │ send_followup_sms   │ Server │ Sends SMS via Twilio after call       │ SMS templates       │
 ├─────────────────────┼────────┼───────────────────────────────────────┼─────────────────────┤
 │ transfer_to_human   │ Client │ Warm/cold transfer via Twilio         │ Transfer-to number  │
 │                     │        │ conference                            │                     │
 ├─────────────────────┼────────┼───────────────────────────────────────┼─────────────────────┤
 │ leave_voicemail     │ Client │ Plays pre-recorded voicemail, ends    │ Voicemail TTS text  │
 │                     │        │ call                                  │                     │
 ├─────────────────────┼────────┼───────────────────────────────────────┼─────────────────────┤
 │ lookup_product_info │ Server │ Returns product/pricing from agent's  │ Product catalog     │
 │                     │        │ catalog                               │ JSON                │
 ├─────────────────────┼────────┼───────────────────────────────────────┼─────────────────────┤
 │ check_crm_record    │ Server │ Fetches contact from                  │ CRM OAuth           │
 │                     │        │ HubSpot/Salesforce/Pipedrive          │ credentials         │
 ├─────────────────────┼────────┼───────────────────────────────────────┼─────────────────────┤
 │ update_crm_record   │ Server │ Pushes outcome + notes back to CRM    │ CRM OAuth           │
 │                     │        │                                       │ credentials         │
 ├─────────────────────┼────────┼───────────────────────────────────────┼─────────────────────┤
 │ qualify_lead        │ Server │ Scores lead against                   │ Qualification       │
 │                     │        │ BANT/MEDDIC/custom criteria           │ config              │
 └─────────────────────┴────────┴───────────────────────────────────────┴─────────────────────┘

 ---
 Tier 3 — User-Configurable Tools (user sets up via UI)

 ┌─────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
 │        Tool         │           What it does            │         User configures          │
 ├─────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
 │                     │ Calls user's HTTP endpoint with   │ URL, method, auth headers,       │
 │ custom_webhook      │ structured data                   │ request template, response       │
 │                     │                                   │ mapping                          │
 ├─────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
 │ rag_knowledge_base  │ Semantic search over uploaded     │ Document uploads → pgvector      │
 │                     │ docs (PDF/DOCX/TXT)               │ embeddings                       │
 ├─────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
 │ custom_api_lookup   │ Proxy-calls user's own API (CRM,  │ Base URL, auth type, endpoint    │
 │                     │ inventory, etc.)                  │ paths, JSONPath response mapping │
 ├─────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
 │                     │ Fetches from Google               │ Data source URL, credentials,    │
 │ dynamic_data_lookup │ Sheet/Airtable/CSV (cached in     │ key column                       │
 │                     │ Redis)                            │                                  │
 └─────────────────────┴───────────────────────────────────┴──────────────────────────────────┘

 All Tier 3 tools are configured per-agent, stored in the tools table, and exposed to ElevenLabs
 as server tools pointing to /tools/custom/{tool_id}.

 ---
 Project Structure

 voxara-backend/
 ├── app/
 │   ├── main.py                    # FastAPI app factory, lifespan, middleware
 │   ├── config.py                  # pydantic-settings: all env vars
 │   ├── dependencies.py            # get_db, get_current_user, get_redis
 │   │
 │   ├── routers/
 │   │   ├── auth.py                # /auth — register, login, refresh, logout
 │   │   ├── agents.py              # /agents — CRUD + ElevenLabs sync
 │   │   ├── calls.py               # /calls — initiate, list, detail, end
 │   │   ├── campaigns.py           # /campaigns — CRUD + start/pause/stop
 │   │   ├── phone_numbers.py       # /phone-numbers — provision, assign, release
 │   │   ├── leads.py               # /leads — CRUD, import/export, DNC
 │   │   ├── tools.py               # /tools — catalog + custom CRUD + server tool endpoints
 │   │   ├── webhooks.py            # /webhooks/twilio — inbound, TwiML, status
 │   │   ├── analytics.py           # /analytics — aggregated metrics
 │   │   ├── knowledge_base.py      # /kb — document upload + indexing
 │   │   └── settings.py            # /settings — integrations, billing, API keys
 │   │
 │   ├── websockets/
 │   │   ├── bridge.py              # Core Twilio↔ElevenLabs bridge (most complex file)
 │   │   ├── bridge_manager.py      # Active call registry: call_sid → bridge instance
 │   │   └── events.py              # Event type dataclasses
 │   │
 │   ├── services/
 │   │   ├── elevenlabs_service.py  # EL REST API: agent CRUD, voice list, config builder
 │   │   ├── twilio_service.py      # Twilio REST: calls, SMS, TwiML gen, signature verify
 │   │   ├── campaign_service.py    # Campaign execution, contact iteration, rate control
 │   │   ├── transcript_service.py  # Transcript assembly + sentiment + LLM summary
 │   │   ├── crm_service.py         # CRM provider abstraction (HubSpot / Salesforce)
 │   │   ├── calendar_service.py    # Calendar abstraction (Cal.com / Google Cal)
 │   │   ├── embedding_service.py   # Doc chunking + OpenAI embedding + pgvector write
 │   │   └── auth_service.py        # JWT encode/decode, refresh token management
 │   │
 │   ├── tools/
 │   │   ├── registry.py            # Maps tool_name → handler + client/server classification
 │   │   ├── executor.py            # Called by bridge: dispatches client tool calls
 │   │   ├── schemas.py             # ToolCall / ToolResult Pydantic models
 │   │   ├── tier1/                 # Client tools (6 files, one per tool)
 │   │   ├── tier2/                 # Server + client tools (8 files)
 │   │   └── tier3/                 # User-configurable server tools (4 files)
 │   │
 │   ├── models/                    # SQLAlchemy 2.0 ORM models
 │   │   ├── base.py                # DeclarativeBase + TimestampMixin
 │   │   ├── user.py
 │   │   ├── agent.py
 │   │   ├── call.py
 │   │   ├── lead.py
 │   │   ├── campaign.py
 │   │   ├── phone_number.py
 │   │   ├── tool.py
 │   │   └── document.py            # KB documents + chunks (with VECTOR column)
 │   │
 │   ├── schemas/                   # Pydantic request/response schemas
 │   ├── db/
 │   │   ├── session.py             # AsyncEngine + AsyncSessionLocal + get_db
 │   │   └── redis.py               # Redis async client factory
 │   ├── core/
 │   │   ├── security.py            # Password hash, JWT
 │   │   ├── exceptions.py          # Custom exceptions + FastAPI exception handlers
 │   │   ├── middleware.py          # Auth middleware, rate limiting
 │   │   └── permissions.py        # Ownership checks (agent.user_id == current_user.id)
 │   ├── tasks/
 │   │   ├── worker.py              # ARQ WorkerSettings
 │   │   ├── post_call_tasks.py     # Transcript save, CRM sync, sentiment, summary
 │   │   ├── campaign_tasks.py      # Dial next contact, retry logic
 │   │   └── maintenance_tasks.py   # Cleanup, data retention
 │   └── utils/
 │       ├── twiml.py               # TwiML XML generation helpers
 │       ├── crypto.py              # Fernet encrypt/decrypt for stored API keys
 │       └── pagination.py          # Cursor pagination helpers
 │
 ├── alembic/                       # DB migrations
 ├── tests/
 ├── pyproject.toml
 ├── requirements.txt
 └── docker-compose.yml             # postgres + redis + pgvector + arq worker

 ---
 Database Schema (PostgreSQL + pgvector)

 users

 id UUID PK | email UNIQUE | hashed_password | full_name | company_name
 subscription_tier (free/starter/growth/enterprise) | subscription_status
 stripe_customer_id | twilio_account_sid | twilio_auth_token (encrypted)
 timezone | is_active | email_verified | created_at | updated_at | last_login_at

 agents

 id UUID PK | user_id FK | name | description
 elevenlabs_agent_id | voice_id | language
 system_prompt | first_message | agent_role | company_name | product_name
 call_type (outbound/inbound/both) | max_call_duration_seconds | silence_timeout_seconds
 call_script JSONB {opener, discovery, pitch, objection_handling, closing, faq}
 enabled_tools TEXT[] | tool_configs JSONB {tool_name: {config}}
 product_catalog JSONB | qualification_criteria JSONB
 el_config_snapshot JSONB | el_last_synced_at | signing_secret (for server tool validation)
 is_active | created_at | updated_at

 calls

 id UUID PK | user_id FK | agent_id FK | campaign_id FK | phone_number_id FK | lead_id FK
 twilio_call_sid UNIQUE | from_number | to_number | direction (inbound/outbound)
 started_at | answered_at | ended_at | duration_seconds
 status | outcome | disposition_notes
 transcript JSONB [{role, text, timestamp, confidence}]
 stage_timeline JSONB [{stage, started_at, duration_seconds}]
 recording_url | recording_sid
 sentiment_score FLOAT | talk_ratio FLOAT | key_moments JSONB | auto_summary TEXT
 follow_up_date | next_action | crm_synced_at | created_at | updated_at
 INDEX: user_id, agent_id, campaign_id, twilio_call_sid, created_at

 leads

 id UUID PK | user_id FK | first_name | last_name | email | phone (E.164) UNIQUE per user
 company | title | industry | company_size | website
 lead_status (new/contacted/qualified/converted/lost) | qualification_score 0-100
 crm_provider | crm_id | crm_synced_at
 tags TEXT[] | custom_fields JSONB | notes TEXT
 do_not_call BOOLEAN | do_not_call_reason
 total_calls | last_called_at | last_agent_id FK | created_at | updated_at
 UNIQUE (user_id, phone)

 campaigns

 id UUID PK | user_id FK | agent_id FK | phone_number_id FK | name | description
 status (draft/scheduled/running/paused/completed/failed)
 scheduled_start_at | call_window_start TIME | call_window_end TIME | call_window_timezone
 call_days INTEGER[] (ISO weekdays) | max_concurrent_calls | retry_attempts | retry_delay_minutes
 contacts JSONB [{phone, first_name, last_name, ...custom}] | total_contacts
 contacts_called | contacts_answered | contacts_completed | contacts_failed | contacts_dnc
 conversion_rate FLOAT | avg_call_duration FLOAT
 started_at | completed_at | created_at | updated_at

 phone_numbers

 id UUID PK | user_id FK | phone_number UNIQUE | friendly_name | country_code
 capabilities JSONB {voice, sms} | twilio_sid UNIQUE | twilio_account_sid
 inbound_enabled BOOLEAN | inbound_agent_id FK | inbound_fallback_url
 monthly_cost NUMERIC | purchased_at | released_at | is_active

 tools (user-defined custom tools)

 id UUID PK | user_id FK | agent_id FK
 tool_type (custom_webhook/rag_kb/custom_api/dynamic_data)
 name | description | parameters_schema JSONB (JSON Schema)
 config JSONB | config_encrypted TEXT (Fernet for API keys/secrets)
 is_active | created_at | updated_at

 documents + document_chunks

 documents: id | user_id | agent_id | tool_id | filename | file_type | storage_path | chunk_count
 | status
 document_chunks: id | document_id | chunk_index | content TEXT | embedding VECTOR(1536) |
 metadata JSONB
 INDEX: ivfflat on embedding for ANN search

 ---
 Call Flows

 Outbound Call Flow

 1. POST /calls/outbound → validate agent ownership → Twilio REST creates call → returns call_sid
 2. Twilio calls GET /webhooks/twilio/twiml/{call_record_id} when answered → returns <Stream>
 TwiML pointing to wss://api/ws/bridge/{call_record_id}
 3. Pre-load call context into Redis: call:{call_sid} → {agent_id, user_id, agent_config,
 lead_data, tool_configs, enabled_tools}
 4. Twilio opens WS → bridge opens ElevenLabs WS → sends conversation_initiation_client_data with
 dynamic variables (lead name, company, etc.)
 5. Audio relay loop: Twilio μ-law 8kHz base64 ↔ bridge ↔ ElevenLabs (no transcoding needed — same
  format both sides)
 6. Client tool calls: ElevenLabs sends client_tool_call event → bridge → tool_executor.execute()
 → tool handler (DB write, Redis, Twilio API) → tool_result back to ElevenLabs WS
 7. Call end: end_call tool OR Twilio stop event → close both WS → enqueue ARQ
 post_call_processing task
 8. ARQ task: assemble transcript from Redis → write to calls table → sentiment analysis → LLM
 summary → CRM sync if enabled → update campaign counters

 Inbound Call Flow

 1. Twilio POSTs POST /webhooks/twilio/inbound → validate Twilio signature → lookup phone_numbers
 by To → find inbound_agent_id
 2. Create calls record with direction=inbound, pre-load Redis context
 3. Return <Stream> TwiML → same bridge flow as outbound steps 4-8

 Server Tool Call Flow (Tier 2/3)

 1. ElevenLabs calls POST /tools/{tool_name} with X-Voxara-Secret header + {parameters,
 call_metadata}
 2. Endpoint validates secret against agents.signing_secret, fetches tool config
 3. Executes: external API call (Cal.com, HubSpot, user's webhook, pgvector query, etc.)
 4. Returns {"result": "Meeting booked for Tuesday at 2pm"} — ElevenLabs continues conversation

 ---
 ElevenLabs Agent Config (on create/update)

 {
   "name": "Voxara: {agent_name}",
   "conversation_config": {
     "agent": {
       "prompt": {
         "prompt": "{system_prompt with {{lead_first_name}}, {{product_name}} variables}",
         "llm": "gemini-1.5-flash",
         "tools": [
           {"type": "client", "name": "save_lead", "description": "...", "parameters": {}},
           {"type": "client", "name": "end_call", ...},
           {"type": "server", "name": "book_meeting", "url":
 "https://api.voxara.io/tools/book_meeting",
            "headers": {"X-Voxara-Secret": "{signing_secret}", "X-Agent-Id": "{agent_id}"},
 "parameters": {}}
         ]
       },
       "first_message": "{first_message}"
     },
     "tts": {"voice_id": "{voice_id}", "model_id": "eleven_turbo_v2_5"},
     "stt": {"user_input_audio_format": "ulaw_8000"},
     "turn": {"silence_end_call_timeout": 30}
   }
 }

 Dynamic variables injected by bridge at call start: lead_first_name, lead_company, product_name,
 call_id, plus any custom fields from the campaign contact row.

 Sync rule: Always sync EL agent config on save. Never sync while calls are in-progress on that
 agent.

 ---
 Tech Stack

 ┌──────────────────┬────────────────────────────────┬───────────────────────────────────────┐
 │     Concern      │             Choice             │                Reason                 │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Framework        │ FastAPI 0.115+                 │ Async native, best OpenAPI            │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Server           │ uvicorn single worker +        │ WS state requires sticky sessions     │
 │                  │ gunicorn                       │                                       │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ ORM              │ SQLAlchemy 2.0 async + asyncpg │ Mature, Alembic, best async perf      │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Migrations       │ Alembic                        │ Only real choice for SQLAlchemy       │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Auth             │ python-jose + passlib[bcrypt]  │ JWT 15min access + 30d refresh tokens │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ WebSocket        │ Starlette native (built-in)    │ Twilio-facing bridge endpoint         │
 │ (server)         │                                │                                       │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ WebSocket        │ websockets lib                 │ Outbound EL connection from bridge    │
 │ (client)         │                                │                                       │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Redis client     │ redis.asyncio                  │ Call state, cache, rate limiting      │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Background tasks │ ARQ (async Redis Queue)        │ Pure asyncio, works with async        │
 │                  │                                │ SQLAlchemy                            │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ HTTP client      │ httpx[asyncio]                 │ All external API calls (EL, Twilio,   │
 │                  │                                │ CRM)                                  │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Encryption       │ cryptography (Fernet)          │ API keys at rest in DB                │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Embeddings       │ openai                         │ KB RAG                                │
 │                  │ (text-embedding-3-small)       │                                       │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Vector search    │ pgvector extension             │ Same DB, no extra service             │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Retry            │ tenacity                       │ EL/Twilio/CRM API resilience          │
 ├──────────────────┼────────────────────────────────┼───────────────────────────────────────┤
 │ Logging          │ structlog                      │ Structured logs with call context     │
 └──────────────────┴────────────────────────────────┴───────────────────────────────────────┘

 ---
 Complete API Endpoints

 Auth — /api/v1/auth

 POST /register · POST /login · POST /refresh · POST /logout
 POST /forgot-password · POST /reset-password · GET /me · PATCH /me

 Agents — /api/v1/agents

 GET / · POST / · GET /{id} · PATCH /{id} · DELETE /{id}
 POST /{id}/clone · POST /{id}/sync · GET /{id}/tools · PATCH /{id}/tools
 POST /{id}/test-call · GET /voices

 Calls — /api/v1/calls

 GET / · POST /outbound · GET /{id} · GET /{id}/transcript
 GET /{id}/recording · POST /{id}/end · GET /active

 Campaigns — /api/v1/campaigns

 GET / · POST / · GET /{id} · PATCH /{id} · DELETE /{id}
 POST /{id}/start · POST /{id}/pause · POST /{id}/resume · POST /{id}/stop
 POST /{id}/contacts (CSV upload) · GET /{id}/contacts · GET /{id}/calls

 Phone Numbers — /api/v1/phone-numbers

 GET / · GET /available · POST /provision · DELETE /{id} · PATCH /{id}

 Leads — /api/v1/leads

 GET / · POST / · GET /{id} · PATCH /{id} · DELETE /{id}
 GET /{id}/calls · POST /import · GET /export · POST /{id}/do-not-call

 Analytics — /api/v1/analytics

 GET /overview · GET /calls · GET /outcomes · GET /agents
 GET /campaigns · GET /leads · GET /talk-time

 Tools — /api/v1/tools

 GET /catalog · GET /custom · POST /custom · GET /custom/{id} · PATCH /custom/{id} · DELETE
 /custom/{id} · POST /custom/{id}/test
 (EL server tool endpoints): POST /book_meeting · POST /send_sms · POST /product_info · POST
 /crm_lookup · POST /crm_update · POST /qualify_lead · POST /custom/{id} · POST /kb_query/{id} ·
 POST /api/{id} · POST /data/{id}

 Knowledge Base — /api/v1/kb

 GET / · POST / · GET /{id} · DELETE /{id}
 POST /{id}/documents · GET /{id}/documents · DELETE /{id}/documents/{doc_id} · POST /{id}/query

 Twilio Webhooks — /api/v1/webhooks/twilio

 POST /inbound · GET /twiml/{call_record_id} · POST /status · POST /recording

 WebSocket — /ws

 WS /bridge/{call_record_id} — Twilio media stream
 WS /events/{user_id} — Real-time call status to frontend

 Settings — /api/v1/settings

 GET /integrations · POST /integrations/{type} · DELETE /integrations/{type}
 GET /billing · GET /usage · POST /twilio (BYO Twilio creds)
 GET /api-keys · POST /api-keys · DELETE /api-keys/{id}

 ---
 Implementation Phases

 ┌──────────────────┬───────────────────────────────────────────┬─────────────────────────────┐
 │      Phase       │                   Scope                   │         Deliverable         │
 ├──────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
 │ 1 — Foundation   │ Scaffold, config, DB, Redis, Alembic,     │ Working auth with           │
 │                  │ auth router + JWT                         │ access/refresh tokens       │
 ├──────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
 │ 2 — Core         │ Agents CRUD + EL sync, phone numbers,     │ Agent creation syncs to     │
 │                  │ Twilio webhooks, TwiML gen                │ ElevenLabs                  │
 ├──────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
 │ 3 — Bridge +     │ Full WebSocket bridge (audio + tool       │ End-to-end calls with       │
 │ Tier 1 Tools     │ dispatch), all 6 tier-1 tools, call       │ save_lead working           │
 │                  │ initiation                                │                             │
 ├──────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
 │ 4 — Post-Call +  │ ARQ tasks (transcript, sentiment,         │ Campaign dialing + call     │
 │ Campaigns        │ summary), campaigns router + worker       │ records in DB               │
 ├──────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
 │ 5 — Tier 2 Tools │ book_meeting, send_sms, CRM tools,        │ Full optional tools +       │
 │  + Analytics     │ analytics aggregations, real-time WS      │ dashboard analytics         │
 │                  │ events                                    │                             │
 ├──────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
 │ 6 — Tier 3 +     │ Custom webhook/API/RAG tools, KB document │ User-configurable tools +   │
 │ Polish           │  ingestion, rate limiting, Twilio sig     │ production hardening        │
 │                  │ validation                                │                             │
 └──────────────────┴───────────────────────────────────────────┴─────────────────────────────┘

 ---
 Critical Architectural Notes

 1. Bridge scaling: The bridge holds two open WS connections per active call. Use single uvicorn
 worker per pod with sticky sessions (load balancer). Do NOT use --workers > 1 without a WS-aware
 gateway.
 2. Tool server endpoint security: Every POST /tools/* endpoint must validate X-Voxara-Secret
 against agents.signing_secret. Without this, the endpoints are unauthenticated public HTTP.
 3. DNC compliance: Check leads.do_not_call at both call initiation (POST /calls/outbound) AND
 campaign task dispatch. Never dial a DNC-flagged number.
 4. EL config during active calls: Never sync ElevenLabs agent config while calls.status =
 'in-progress' for that agent — it disrupts active sessions. Check before sync.
 5. Audio format: Twilio sends μ-law 8kHz base64. ElevenLabs with stt.user_input_audio_format:
 ulaw_8000 accepts the same format. The bridge passes through without transcoding — zero latency
 overhead.
 6. Redis call context: All tools running in the bridge have access to call_context from Redis
 (call:{call_sid}), eliminating DB queries during the hot audio path.

 ---
 Verification Plan

 1. Unit: Each tool handler in tier1/ and tier2/ has a test with mocked DB/Redis
 2. Integration: Bridge test that connects two mock WS endpoints (Twilio side, EL side) and
 verifies audio relay + tool dispatch round-trip
 3. E2E: Use Twilio test credentials to make a real outbound call to Twilio's echo number, verify
 bridge connects, log_call_outcome fires, call record appears in GET /calls
 4. Tool validation: For each server tool endpoint, send a POST with a valid X-Voxara-Secret and
 verify expected external API call is made (mock external APIs with httpx mock transport)
 5. Campaign: Create a campaign with 2 contacts, start it, verify ARQ tasks fire, both contacts
 are dialed sequentially with correct delay
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌