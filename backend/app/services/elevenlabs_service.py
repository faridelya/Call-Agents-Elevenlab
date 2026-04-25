"""ElevenLabs REST API client — agent CRUD, voice list, config builder."""
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.core.exceptions import ExternalServiceError


class ElevenLabsService:
    def __init__(self):
        self._base = settings.elevenlabs_base_url
        self._headers = {"xi-api-key": settings.elevenlabs_api_key, "Content-Type": "application/json"}

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(headers=self._headers, timeout=15.0)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=4))
    async def create_agent(self, config: dict) -> str:
        """Create an ElevenLabs agent. Returns agent_id."""
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

    def build_agent_config(self, agent, tools: list[dict]) -> dict:
        """Build the full ElevenLabs agent config payload from a Voxara Agent model.

        All tuneable parameters come from the agent record so the user
        controls them from the UI — nothing is hardcoded here.
        """
        tool_definitions = self._build_tool_definitions(agent, tools)

        llm_model    = getattr(agent, "llm_model", "gemini-1.5-flash") or "gemini-1.5-flash"
        temperature  = getattr(agent, "llm_temperature", 0.7) or 0.7
        stability    = getattr(agent, "voice_stability", 0.5) if agent.voice_stability is not None else 0.5
        similarity   = getattr(agent, "voice_similarity", 0.75) if agent.voice_similarity is not None else 0.75

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
        from app.tools.registry import list_tools, get_tool
        from app.config import settings

        defs = []
        base_url = settings.public_url

        # Always include Tier 1 tools as client tools
        tier1_names = ["save_lead", "get_contact_info", "end_call", "log_call_outcome", "get_call_script", "update_call_stage"]
        for name in tier1_names:
            tool = get_tool(name)
            if tool:
                defs.append({
                    "type": "client",
                    "name": name,
                    "description": tool["description"],
                    "parameters": tool["parameters"],
                })

        # Enabled Tier 2 tools
        tier2_client = {"transfer_to_human", "leave_voicemail"}
        tier2_server = {"book_meeting", "send_followup_sms", "lookup_product_info", "check_crm_record", "update_crm_record", "qualify_lead"}

        # Human-readable descriptions for each server tool (used by the LLM)
        tier2_descriptions = {
            "book_meeting": "Book a meeting or appointment for the contact using the configured calendar integration.",
            "send_followup_sms": "Send a follow-up SMS message to the contact after the call ends.",
            "lookup_product_info": "Look up product or pricing information from the agent's product catalog based on what the contact is asking about.",
            "check_crm_record": "Look up the contact's existing record in the CRM (HubSpot or Salesforce) by phone number.",
            "update_crm_record": "Update the contact's CRM record with call outcome, notes, and any other relevant information gathered during the call.",
            "qualify_lead": "Score and qualify the lead based on the agent's configured qualification criteria.",
        }

        # Server tool parameters schemas
        tier2_parameters = {
            "book_meeting": {
                "type": "object",
                "properties": {
                    "contact_name": {"type": "string", "description": "Full name of the contact"},
                    "preferred_date": {"type": "string", "description": "Preferred date/time for the meeting, e.g. 'Tuesday afternoon' or '2024-05-15 14:00'"},
                    "meeting_type": {"type": "string", "description": "Type of meeting, e.g. 'demo', 'discovery call', 'follow-up'"},
                },
                "required": ["contact_name", "preferred_date"],
            },
            "send_followup_sms": {
                "type": "object",
                "properties": {
                    "phone_number": {"type": "string", "description": "Phone number to send SMS to in E.164 format"},
                    "message_template": {"type": "string", "description": "Optional custom message. If omitted, the configured default template is used."},
                },
                "required": ["phone_number"],
            },
            "lookup_product_info": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "What the contact is asking about — product name, feature, or pricing question"},
                },
                "required": ["query"],
            },
            "check_crm_record": {
                "type": "object",
                "properties": {
                    "phone_number": {"type": "string", "description": "Phone number to look up in CRM"},
                },
                "required": ["phone_number"],
            },
            "update_crm_record": {
                "type": "object",
                "properties": {
                    "crm_id": {"type": "string", "description": "CRM record ID to update"},
                    "properties": {"type": "object", "description": "Key-value pairs to update on the CRM record"},
                    "note": {"type": "string", "description": "Note to add to the CRM record about this call"},
                },
                "required": ["crm_id"],
            },
            "qualify_lead": {
                "type": "object",
                "properties": {
                    "answers": {"type": "object", "description": "Key-value pairs of qualification criteria and the contact's answers"},
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
                    "description": tier2_descriptions.get(tool_name, f"Built-in tool: {tool_name.replace('_', ' ')}"),
                    "url": f"{base_url}/api/v1/tools/{tool_name}",
                    "method": "POST",
                    "headers": {
                        "X-Voxara-Secret": agent.signing_secret,
                        "X-Agent-Id": agent.id,
                    },
                    "parameters": tier2_parameters.get(tool_name, {"type": "object", "properties": {}}),
                })

        # Tier 3 custom tools
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
