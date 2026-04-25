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
        ElevenLabs connects its WebSocket to Twilio natively — no custom bridge needed.
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

        async with self._client() as c:
            r = await c.post(f"{self._base}/convai/twilio/register_call", json=payload)
            if r.status_code not in (200, 201):
                log.error("el_register_call_failed",
                          status=r.status_code, body=r.text[:300])
                raise ExternalServiceError("ElevenLabs", r.text)

            data = r.json()
            log.info("el_register_call_ok",
                     agent_id=agent_id,
                     conversation_id=data.get("call_id", ""),
                     direction=direction)

            # Normalise field names — EL returns "call_id" for the conversation ID
            return {
                "conversation_id": data.get("call_id") or data.get("conversation_id", ""),
                "twiml": data.get("twiml", ""),
            }

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
                    text = entry.get("message", "").strip()
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

        llm_model   = getattr(agent, "llm_model", "gemini-1.5-flash") or "gemini-1.5-flash"
        temperature = getattr(agent, "llm_temperature", 0.7) or 0.7
        stability   = agent.voice_stability  if agent.voice_stability  is not None else 0.5
        similarity  = agent.voice_similarity if agent.voice_similarity is not None else 0.75

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
                "tts": {
                    "voice_id": agent.voice_id,
                    "model_id": "eleven_turbo_v2",
                    "voice_settings": {
                        "stability": stability,
                        "similarity_boost": similarity,
                        "use_speaker_boost": True,
                    },
                    "optimize_streaming_latency": 3,
                    "output_format": "ulaw_8000",
                },
                "stt": {
                    "quality": "high",
                },
                "turn": {
                    "turn_timeout": agent.silence_timeout_seconds,
                    "silence_end_call_timeout": 30,
                    "mode": "turn",
                },
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

        # ── Tier 1 tools — server-side HTTP callbacks (native integration) ────
        # EL will POST to these URLs when the agent calls a tier 1 tool.
        tier1_names = [
            "save_lead", "get_contact_info", "end_call",
            "log_call_outcome", "get_call_script", "update_call_stage",
        ]
        for name in tier1_names:
            tool = get_tool(name)
            if tool:
                defs.append({
                    "type": "server",
                    "name": name,
                    "description": tool["description"],
                    "url": f"{base_url}/api/v1/el/tools/{name}",
                    "method": "POST",
                    "headers": {
                        "X-Voxara-Secret": agent.signing_secret,
                        "X-Agent-Id": agent.id,
                    },
                    "parameters": tool["parameters"],
                })

        # ── Tier 2 client tools (transfer_to_human, leave_voicemail) ──────────
        tier2_client = {"transfer_to_human", "leave_voicemail"}
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
            if tool_name in tier2_client:
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
                    "type": "server",
                    "name": tool_name,
                    "description": tier2_descriptions.get(tool_name, tool_name),
                    "url": f"{base_url}/api/v1/tools/{tool_name}",
                    "method": "POST",
                    "headers": {
                        "X-Voxara-Secret": agent.signing_secret,
                        "X-Agent-Id": agent.id,
                    },
                    "parameters": tier2_parameters.get(tool_name, {"type": "object", "properties": {}}),
                })

        # ── Tier 3 custom tools ────────────────────────────────────────────────
        for ct in custom_tools:
            defs.append({
                "type": "server",
                "name": ct["name"],
                "description": ct["description"],
                "url": f"{base_url}/api/v1/tools/custom/{ct['id']}",
                "method": "POST",
                "headers": {
                    "X-Voxara-Secret": agent.signing_secret,
                    "X-Agent-Id": agent.id,
                },
                "parameters": ct["parameters_schema"],
            })

        return defs


elevenlabs_service = ElevenLabsService()
