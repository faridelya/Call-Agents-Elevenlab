"""ElevenLabs REST API client — agent CRUD, voice list, Twilio register_call, transcript fetch."""
from datetime import datetime, timezone
import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.core.exceptions import ExternalServiceError

log = structlog.get_logger(__name__)


class ElevenLabsService:
    def __init__(self):
        self._base = settings.elevenlabs_base_url
        self._headers = {
            "xi-api-key": settings.elevenlabs_api_key,
            "Content-Type": "application/json",
        }

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(headers=self._headers, timeout=15.0)

    # ── Agent CRUD ────────────────────────────────────────────────────────────

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=4))
    async def create_agent(self, config: dict) -> str:
        async with self._client() as c:
            r = await c.post(f"{self._base}/convai/agents/create", json=config)
            if r.status_code not in (200, 201):
                raise ExternalServiceError("ElevenLabs", r.text)
            return r.json()["agent_id"]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=4))
    async def update_agent(self, agent_id: str, config: dict) -> None:
        async with self._client() as c:
            r = await c.patch(f"{self._base}/convai/agents/{agent_id}", json=config)
            if r.status_code not in (200, 204):
                raise ExternalServiceError("ElevenLabs", r.text)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=4))
    async def delete_agent(self, agent_id: str) -> None:
        async with self._client() as c:
            r = await c.delete(f"{self._base}/convai/agents/{agent_id}")
            if r.status_code not in (200, 204, 404):
                raise ExternalServiceError("ElevenLabs", r.text)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=4))
    async def list_voices(self) -> list[dict]:
        async with self._client() as c:
            r = await c.get(f"{self._base}/voices")
            if r.status_code != 200:
                raise ExternalServiceError("ElevenLabs", r.text)
            return r.json().get("voices", [])

    # ── Native Twilio integration ─────────────────────────────────────────────

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=3))
    async def register_call(
        self,
        agent_id: str,
        from_number: str,
        to_number: str,
        direction: str,
        dynamic_vars: dict | None = None,
    ) -> dict:
        """Register a Twilio call with ElevenLabs.

        Returns {"conversation_id": "conv_...", "twiml": "<?xml...>"}
        EL responds with raw TwiML (XML); conversation_id is embedded as a <Parameter>.
        """
        payload: dict = {
            "agent_id": agent_id,
            "from_number": from_number,
            "to_number": to_number,
            "direction": direction,
        }
        if dynamic_vars:
            payload["conversation_initiation_client_data"] = {
                "dynamic_variables": dynamic_vars,
            }

        log.info("el_register_call_attempt",
                 agent_id=agent_id,
                 from_number=from_number,
                 to_number=to_number,
                 direction=direction,
                 dynamic_vars_keys=list((dynamic_vars or {}).keys()),
                 endpoint=f"{self._base}/convai/twilio/register-call")

        async with self._client() as c:
            # Correct endpoint uses a hyphen, not underscore
            r = await c.post(f"{self._base}/convai/twilio/register-call", json=payload)

            log.info("el_register_call_response",
                     agent_id=agent_id,
                     to_number=to_number,
                     http_status=r.status_code,
                     content_type=r.headers.get("content-type", ""),
                     response_length=len(r.text))

            if r.status_code not in (200, 201):
                log.error("el_register_call_failed",
                          http_status=r.status_code,
                          body=r.text[:500],
                          agent_id=agent_id,
                          from_number=from_number,
                          to_number=to_number,
                          direction=direction,
                          hint="Check that the EL agent_id is valid, the phone number is not "
                              "shared by multiple EL agents, and your EL plan supports this call type.")
                raise ExternalServiceError("ElevenLabs", r.text)

            # EL returns raw TwiML (XML), not JSON
            # Extract conversation_id from <Parameter name="conversation_id" value="conv_..."/>
            twiml = r.text
            conversation_id = ""
            try:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(twiml)
                for param in root.iter("Parameter"):
                    if param.get("name") == "conversation_id":
                        conversation_id = param.get("value", "")
                        break
            except Exception as xml_err:
                log.warning("el_register_call_twiml_parse_error",
                            agent_id=agent_id, error=str(xml_err),
                            twiml_preview=twiml[:200])

            if not conversation_id:
                log.warning("el_register_call_no_conv_id",
                            agent_id=agent_id,
                            twiml_preview=twiml[:300],
                            note="EL returned TwiML but no conversation_id Parameter was found. "
                                 "The audio WebSocket may still work but transcript tracking will fail.")

            log.info("el_register_call_ok",
                     agent_id=agent_id,
                     conversation_id=conversation_id or "MISSING",
                     direction=direction,
                     from_number=from_number,
                     to_number=to_number)

            return {
                "conversation_id": conversation_id,
                "twiml": twiml,
            }

    async def get_subscription_tier(self, api_key: str) -> dict:
        """Return {tier, is_enterprise} for the given EL API key.

        Calls GET /v1/user/subscription. Callers should cache the result — this
        does a live API round-trip every time.
        """
        try:
            async with httpx.AsyncClient(timeout=8.0) as c:
                r = await c.get(
                    f"{self._base}/user/subscription",
                    headers={"xi-api-key": api_key},
                )
            if r.status_code == 200:
                tier = r.json().get("tier", "free")
                return {"tier": tier, "is_enterprise": tier == "enterprise"}
        except Exception as exc:
            log.warning("el_subscription_check_failed", error=str(exc))
        return {"tier": "unknown", "is_enterprise": False}

    async def get_subscription_usage(self, api_key: str) -> dict:
        """Return raw ElevenLabs subscription usage and billing fields."""
        try:
            async with httpx.AsyncClient(timeout=8.0) as c:
                r = await c.get(
                    f"{self._base}/user/subscription",
                    headers={"xi-api-key": api_key},
                )
            if r.status_code == 200:
                return r.json()
            log.warning(
                "el_subscription_usage_failed",
                http_status=r.status_code,
                body=r.text[:300],
            )
            return {
                "error": f"ElevenLabs returned HTTP {r.status_code}",
                "status_code": r.status_code,
            }
        except Exception as exc:
            log.warning("el_subscription_usage_error", error=str(exc))
            return {"error": str(exc)}

    async def get_conversation_status(self, conversation_id: str) -> str:
        """Return the EL conversation status string: 'processing'|'done'|'failed'|'unknown'."""
        try:
            async with self._client() as c:
                r = await c.get(f"{self._base}/convai/conversations/{conversation_id}")
                if r.status_code == 200:
                    data = r.json()
                    status = data.get("status", "unknown")
                    if status == "failed":
                        meta = data.get("metadata", {})
                        el_error = meta.get("error") or {}
                        log.warning("el_conversation_status_failed",
                                    conversation_id=conversation_id,
                                    termination_reason=meta.get("termination_reason", ""),
                                    error_code=el_error.get("code"),
                                    error_reason=el_error.get("reason"),
                                    tier=meta.get("charging", {}).get("tier", ""),
                                    hint="If error_code=1002, the EL account has exceeded its quota. "
                                        "Upgrade the ElevenLabs plan at elevenlabs.io/pricing.")
                    return status
        except Exception:
            pass
        return "unknown"

    async def get_conversation_full(self, conversation_id: str) -> dict:
        """Fetch transcript + duration + status in one API call.

        Returns:
            {
                "status": str,                    # "done" | "failed" | "processing"
                "duration_seconds": int | None,   # call duration from EL metadata
                "transcript": list[dict],         # parsed [{role, text, timestamp}]
            }
        """
        try:
            async with self._client() as c:
                r = await c.get(f"{self._base}/convai/conversations/{conversation_id}")
                if r.status_code != 200:
                    return {"status": "unknown", "duration_seconds": None, "transcript": []}

                data = r.json()
                status = data.get("status", "unknown")

                meta = data.get("metadata", {})
                duration_secs = meta.get("call_duration_secs")
                duration = int(duration_secs) if duration_secs else None

                start_unix = meta.get("start_time_unix_secs")
                base_dt = (
                    datetime.fromtimestamp(start_unix, tz=timezone.utc)
                    if start_unix else datetime.now(timezone.utc)
                )

                transcript = []
                for entry in data.get("transcript", []):
                    text = (entry.get("message") or "").strip()
                    if not text:
                        continue
                    time_offset = entry.get("time_in_call_secs", 0) or 0
                    iso_ts = datetime.fromtimestamp(
                        base_dt.timestamp() + time_offset, tz=timezone.utc
                    ).isoformat()
                    transcript.append({
                        "role": "agent" if entry.get("role") == "agent" else "user",
                        "text": text,
                        "timestamp": iso_ts,
                    })

                termination_reason = meta.get("termination_reason") or ""
                el_error = meta.get("error") or {}
                tier = meta.get("charging", {}).get("tier", "")

                if status == "failed":
                    log.warning("el_conversation_failed",
                                conversation_id=conversation_id,
                                termination_reason=termination_reason,
                                error_code=el_error.get("code"),
                                error_reason=el_error.get("reason"),
                                tier=tier,
                                duration=duration,
                                messages=len(transcript))
                else:
                    log.info("el_conversation_full_fetched",
                             conversation_id=conversation_id,
                             status=status,
                             messages=len(transcript),
                             duration=duration)
                return {"status": status, "duration_seconds": duration, "transcript": transcript,
                        "termination_reason": termination_reason, "error": el_error, "tier": tier}

        except Exception as exc:
            log.error("el_conversation_full_error", conversation_id=conversation_id, error=str(exc))
            return {"status": "unknown", "duration_seconds": None, "transcript": []}

    async def get_conversation_transcript(self, conversation_id: str) -> list[dict]:
        """Fetch the full transcript for a completed ElevenLabs conversation.

        Returns a list of {"role": "agent"|"user", "text": str, "timestamp": ISO str}.
        Returns [] on any error so callers never crash on a missing transcript.
        """
        try:
            async with self._client() as c:
                r = await c.get(f"{self._base}/convai/conversations/{conversation_id}")
                if r.status_code != 200:
                    log.warning("el_transcript_fetch_failed",
                                conversation_id=conversation_id,
                                status=r.status_code)
                    return []

                data = r.json()
                raw_transcript = data.get("transcript", [])
                if not raw_transcript:
                    return []

                # Derive a base timestamp from call metadata if available
                meta = data.get("metadata", {})
                start_unix = meta.get("start_time_unix_secs")
                base_dt = (
                    datetime.fromtimestamp(start_unix, tz=timezone.utc)
                    if start_unix
                    else datetime.now(timezone.utc)
                )

                result = []
                for entry in raw_transcript:
                    role = entry.get("role", "user")
                    text = (entry.get("message") or "").strip()
                    if not text:
                        continue
                    time_offset = entry.get("time_in_call_secs", 0) or 0
                    ts = base_dt.timestamp() + time_offset
                    iso_ts = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
                    result.append({
                        "role": "agent" if role == "agent" else "user",
                        "text": text,
                        "timestamp": iso_ts,
                    })

                log.info("el_transcript_fetched",
                         conversation_id=conversation_id,
                         messages=len(result))
                return result

        except Exception as exc:
            log.error("el_transcript_error",
                      conversation_id=conversation_id, error=str(exc))
            return []

    # ── Agent config builder ──────────────────────────────────────────────────

    def build_agent_config(self, agent, tools: list[dict]) -> dict:
        """Build the full ElevenLabs agent config payload from a Voxara Agent model."""
        tool_definitions = self._build_tool_definitions(agent, tools)

        llm_model    = getattr(agent, "llm_model",    "gemini-2.0-flash")         or "gemini-2.0-flash"
        temperature  = getattr(agent, "llm_temperature", 0.7)                    or 0.7
        tts_model    = getattr(agent, "tts_model",    "eleven_v3_conversational") or "eleven_v3_conversational"
        stt_provider = getattr(agent, "stt_provider", "elevenlabs")              or "elevenlabs"
        max_call_dur = getattr(agent, "max_call_duration_seconds", 1800)         or 1800

        # TTS — stability/similarity are flat fields at the tts level (not nested in voice_settings).
        # When None the agent uses the voice's own ElevenLabs defaults.
        tts_config: dict = {
            "voice_id": agent.voice_id,
            "model_id": tts_model,
            "optimize_streaming_latency": 3,
        }
        if agent.voice_stability is not None:
            tts_config["stability"] = agent.voice_stability
        if agent.voice_similarity is not None:
            tts_config["similarity_boost"] = agent.voice_similarity

        return {
            "name": f"Voxara: {agent.name}",
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": agent.system_prompt,
                        "llm": llm_model,
                        "temperature": temperature,
                        "max_tokens": 2000,
                        "tools": tool_definitions,
                    },
                    "first_message": agent.first_message or "",
                    "language": agent.language,
                },
                "tts": tts_config,
                "asr": {
                    "quality": "high",
                    "provider": stt_provider,
                },
                "turn": {
                    "turn_timeout": agent.silence_timeout_seconds,
                    "silence_end_call_timeout": 30,
                    "mode": "turn",
                },
                "max_duration_seconds": max_call_dur,
            },
            "platform_settings": {
                "auth": {"enable_auth": False},
            },
        }

    def _build_tool_definitions(self, agent, custom_tools: list[dict]) -> list[dict]:
        from app.tools.registry import get_tool
        from app.config import settings as _settings

        base_url = _settings.public_url
        defs = []

        # ── Tier 1 tools — webhook callbacks (EL native integration) ─────────
        # EL will POST to these URLs when the agent calls a tier 1 tool.
        tier1_names = [
            "save_lead", "get_contact_info", "end_call",
            "log_call_outcome", "get_call_script", "update_call_stage",
        ]
        for name in tier1_names:
            tool = get_tool(name)
            if tool:
                defs.append({
                    "type": "webhook",
                    "name": name,
                    "description": tool["description"],
                    "api_schema": {
                        "url": f"{base_url}/api/v1/el/tools/{name}",
                        "method": "POST",
                        "request_headers": {
                            "X-Voxara-Secret": agent.signing_secret,
                            "X-Agent-Id": agent.id,
                        },
                        "request_body_schema": tool["parameters"],
                    },
                })

        # ── Tier 2 client tools (leave_voicemail only — transfer_to_human ──────
        # is now a webhook so the EL tool callback actually hits our endpoint.
        # In the native Twilio integration there is no JS client, so "client"
        # type tools are silently dropped by EL; transfer MUST be a webhook.
        tier2_client = {"leave_voicemail"}
        tier2_server = {
            "book_meeting", "send_followup_sms", "lookup_product_info",
            "check_crm_record", "update_crm_record", "qualify_lead",
        }

        tier2_descriptions = {
            "book_meeting":       "Book a meeting or appointment for the contact via the configured calendar integration.",
            "send_followup_sms":  "Send a follow-up SMS message to the contact after the call.",
            "lookup_product_info":"Look up product or pricing information from the agent's product catalog.",
            "check_crm_record":   "Look up the contact's existing record in the CRM by phone number.",
            "update_crm_record":  "Push call outcome and notes to the contact's CRM record.",
            "qualify_lead":       "Score and qualify the lead based on the agent's criteria.",
        }

        tier2_parameters = {
            "book_meeting": {
                "type": "object",
                "properties": {
                    "contact_name":   {"type": "string", "description": "Full name of the contact"},
                    "preferred_date": {"type": "string", "description": "Preferred date/time, e.g. 'Tuesday afternoon'"},
                    "meeting_type":   {"type": "string", "description": "Type of meeting: demo, discovery call, follow-up"},
                },
                "required": ["contact_name", "preferred_date"],
            },
            "send_followup_sms": {
                "type": "object",
                "properties": {
                    "phone_number":    {"type": "string", "description": "Recipient phone number in E.164 format"},
                    "message_template":{"type": "string", "description": "Optional custom message; uses default template if omitted"},
                },
                "required": ["phone_number"],
            },
            "lookup_product_info": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Product name, feature, or pricing question"},
                },
                "required": ["query"],
            },
            "check_crm_record": {
                "type": "object",
                "properties": {
                    "phone_number": {"type": "string", "description": "Phone number to look up"},
                },
                "required": ["phone_number"],
            },
            "update_crm_record": {
                "type": "object",
                "properties": {
                    "crm_id":    {"type": "string", "description": "CRM record ID"},
                    "properties":{"type": "object", "description": "Key-value pairs to update"},
                    "note":      {"type": "string", "description": "Note to add about this call"},
                },
                "required": ["crm_id"],
            },
            "qualify_lead": {
                "type": "object",
                "properties": {
                    "answers": {"type": "object", "description": "Qualification criteria and contact's answers"},
                },
                "required": ["answers"],
            },
        }

        for tool_name in agent.enabled_tools:
            if tool_name == "transfer_to_human":
                # Webhook tool — EL calls our endpoint which performs the real Twilio redirect.
                # We enrich the description with the configured number so EL understands
                # it does not need to supply one; it just calls the tool.
                tool = get_tool(tool_name)
                if tool:
                    cfg = (getattr(agent, "tool_configs", None) or {}).get("transfer_to_human", {})
                    configured_number = (cfg.get("transfer_to") or "").strip()
                    number_note = (
                        f" The transfer number {configured_number} is pre-configured — "
                        f"you do not need to supply it as a parameter."
                        if configured_number
                        else " WARNING: no transfer number has been configured for this agent."
                    )
                    defs.append({
                        "type": "webhook",
                        "name": "transfer_to_human",
                        "description": tool["description"] + number_note,
                        "api_schema": {
                            "url": f"{base_url}/api/v1/el/tools/transfer_to_human",
                            "method": "POST",
                            "request_headers": {
                                "X-Voxara-Secret": agent.signing_secret,
                                "X-Agent-Id": agent.id,
                            },
                            "request_body_schema": tool["parameters"],
                        },
                    })
            elif tool_name in tier2_client:
                tool = get_tool(tool_name)
                if tool:
                    defs.append({
                        "type": "client",
                        "name": tool_name,
                        "description": tool["description"],
                        "parameters": tool["parameters"],
                    })
            elif tool_name in tier2_server:
                defs.append({
                    "type": "webhook",
                    "name": tool_name,
                    "description": tier2_descriptions.get(tool_name, tool_name),
                    "api_schema": {
                        "url": f"{base_url}/api/v1/tools/{tool_name}",
                        "method": "POST",
                        "request_headers": {
                            "X-Voxara-Secret": agent.signing_secret,
                            "X-Agent-Id": agent.id,
                        },
                        "request_body_schema": tier2_parameters.get(tool_name, {"type": "object", "properties": {}}),
                    },
                })

        # ── Tier 3 custom tools ────────────────────────────────────────────────
        for ct in custom_tools:
            defs.append({
                "type": "webhook",
                "name": ct["name"],
                "description": ct["description"],
                "api_schema": {
                    "url": f"{base_url}/api/v1/tools/custom/{ct['id']}",
                    "method": "POST",
                    "request_headers": {
                        "X-Voxara-Secret": agent.signing_secret,
                        "X-Agent-Id": agent.id,
                    },
                    "request_body_schema": ct["parameters_schema"],
                },
            })

        return defs


elevenlabs_service = ElevenLabsService()
