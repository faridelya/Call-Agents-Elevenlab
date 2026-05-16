"""ElevenLabs REST API client — agent CRUD, voice list, Twilio register_call, transcript fetch."""
from datetime import datetime, timezone
import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

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

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type(httpx.RequestError),
        reraise=True,
    )
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

        tts_config: dict = {
            "voice_id": agent.voice_id,
            "model_id": tts_model,
            "optimize_streaming_latency": 3,
        }
        if agent.voice_stability is not None:
            tts_config["stability"] = agent.voice_stability
        if agent.voice_similarity is not None:
            tts_config["similarity_boost"] = agent.voice_similarity

        prompt_block: dict = {
            "prompt": agent.system_prompt,
            "llm": llm_model,
            "temperature": temperature,
            "max_tokens": 2000,
            "tools": tool_definitions,
        }

        # Attach EL Knowledge Base when configured
        kb_id = getattr(agent, "knowledge_base_id", None)
        if kb_id:
            prompt_block["knowledge_base"] = [{"type": "file", "id": kb_id}]

        # Attach MCP servers registered with ElevenLabs
        mcp_ids = getattr(agent, "mcp_server_ids", None) or []
        if mcp_ids:
            prompt_block["mcp_server_ids"] = mcp_ids

        conversation_config: dict = {
            "agent": {
                "prompt": prompt_block,
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
        }

        # Evaluation criteria — sync to EL if configured
        evaluation_criteria = getattr(agent, "evaluation_criteria", None) or []
        if evaluation_criteria:
            conversation_config["evaluation_settings"] = {
                "criteria": [
                    {
                        "id": c["id"],
                        "name": c["name"],
                        "type": "prompt",
                        "conversation_goal_prompt": c["conversation_goal_prompt"],
                        "scope": c.get("scope", "conversation"),
                    }
                    for c in evaluation_criteria
                ]
            }

        platform_settings: dict = {
            "auth": {"enable_auth": False},
        }

        # Data collection — attach under platform_settings if configured
        data_collection = getattr(agent, "data_collection", None) or []
        if data_collection:
            try:
                platform_settings["data_collection"] = [
                    {
                        "id": d["id"],
                        "name": d["name"],
                        "type": d.get("type", "string"),
                        "description": d.get("description", ""),
                    }
                    for d in data_collection
                ]
            except Exception:
                # Don't break sync if EL rejects data_collection format
                pass

        return {
            "name": f"Voxara: {agent.name}",
            "conversation_config": conversation_config,
            "platform_settings": platform_settings,
        }

    @staticmethod
    def _override_tool_parameters(tool_name: str, base_params: dict, tool_configs: dict) -> dict:
        """Return a (possibly modified) copy of base_params with per-agent enum overrides applied."""
        import copy, json as _json
        cfg = tool_configs.get(tool_name, {})

        def _parse_list(raw: str) -> list[str]:
            raw = (raw or "").strip()
            if not raw:
                return []
            try:
                parsed = _json.loads(raw)
                if isinstance(parsed, list):
                    return [str(v).strip() for v in parsed if str(v).strip()]
            except _json.JSONDecodeError:
                pass
            return [v.strip() for v in raw.split(",") if v.strip()]

        overrides: dict[str, list[str]] = {}
        if tool_name == "log_call_outcome":
            items = _parse_list(cfg.get("custom_outcomes", ""))
            if items:
                overrides["outcome"] = items
        elif tool_name == "update_call_stage":
            items = _parse_list(cfg.get("custom_stages", ""))
            if items:
                overrides["stage"] = items
        elif tool_name == "get_call_script":
            items = _parse_list(cfg.get("custom_sections", ""))
            if items:
                overrides["section"] = items

        if not overrides:
            return base_params

        params = copy.deepcopy(base_params)
        for field, enum_vals in overrides.items():
            if "properties" in params and field in params["properties"]:
                params["properties"][field]["enum"] = enum_vals
        return params

    def _build_tool_definitions(self, agent, custom_tools: list[dict]) -> list[dict]:
        from app.tools.registry import get_tool
        from app.config import settings as _settings
        from app.tools.system_catalog import EL_SYSTEM_TOOLS, build_system_tool_def
        from app.tools.tier2_catalog import TIER2_SERVER_CATALOG

        base_url = _settings.public_url
        tool_configs = getattr(agent, "tool_configs", None) or {}
        defs = []

        # ── Tool name sets ────────────────────────────────────────────────────
        # Tier 1 tools are now OPTIONAL — only included if they appear in
        # agent.enabled_tools. New agents default to all 6 in their enabled_tools
        # (set by the router at creation time) so the existing behavior is preserved.
        tier1_names = {
            "save_lead", "get_contact_info", "end_call",
            "log_call_outcome", "get_call_script", "update_call_stage",
        }
        # Tier-2 server tools sourced from catalog (single source of truth)
        tier2_server = set(TIER2_SERVER_CATALOG.keys())

        for tool_name in agent.enabled_tools:
            # ── EL native system tools (keys start with "el_") ─────────────────
            if tool_name.startswith("el_") and tool_name in EL_SYSTEM_TOOLS:
                cfg = tool_configs.get(tool_name, {})
                sys_def = build_system_tool_def(tool_name, cfg)
                if sys_def:
                    defs.append(sys_def)
                continue

            # ── Tier 1: platform webhook tools (now opt-in per enabled_tools) ──
            if tool_name in tier1_names:
                tool = get_tool(tool_name)
                if tool:
                    # Allow description override from tool_configs
                    custom_desc = tool_configs.get(tool_name, {}).get("description")
                    description = custom_desc if custom_desc else tool["description"]
                    # Apply per-agent enum overrides (custom outcomes/stages/sections)
                    params = self._override_tool_parameters(tool_name, tool["parameters"], tool_configs)
                    defs.append({
                        "type": "webhook",
                        "name": tool_name,
                        "description": description,
                        "api_schema": {
                            "url": f"{base_url}/api/v1/el/tools/{tool_name}",
                            "method": "POST",
                            "request_headers": {
                                "X-Voxara-Secret": agent.signing_secret,
                                "X-Agent-Id": agent.id,
                            },
                            "request_body_schema": params,
                        },
                    })
                continue

            # ── Our custom transfer_to_human (Twilio webhook) ──────────────────
            if tool_name == "transfer_to_human":
                tool = get_tool(tool_name)
                if tool:
                    cfg = tool_configs.get("transfer_to_human", {})
                    configured_number = (cfg.get("transfer_to") or "").strip()
                    number_note = (
                        f" The transfer number {configured_number} is pre-configured — "
                        f"you do not need to supply it as a parameter."
                        if configured_number
                        else " WARNING: no transfer number has been configured for this agent."
                    )
                    # Allow description override from tool_configs
                    custom_desc = cfg.get("description")
                    base_desc = custom_desc if custom_desc else tool["description"]
                    defs.append({
                        "type": "webhook",
                        "name": "transfer_to_human",
                        "description": base_desc + number_note,
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
            elif tool_name == "leave_voicemail":
                tool = get_tool(tool_name)
                if tool:
                    custom_desc = tool_configs.get(tool_name, {}).get("description")
                    description = custom_desc if custom_desc else tool["description"]
                    defs.append({
                        "type": "webhook",
                        "name": "leave_voicemail",
                        "description": description,
                        "api_schema": {
                            "url": f"{base_url}/api/v1/el/tools/leave_voicemail",
                            "method": "POST",
                            "request_headers": {
                                "X-Voxara-Secret": agent.signing_secret,
                                "X-Agent-Id": agent.id,
                            },
                            "request_body_schema": tool["parameters"],
                        },
                    })
            elif tool_name in tier2_server:
                meta = TIER2_SERVER_CATALOG[tool_name]
                custom_desc = tool_configs.get(tool_name, {}).get("description")
                description = custom_desc if custom_desc else meta["description"]
                defs.append({
                    "type": "webhook",
                    "name": tool_name,
                    "description": description,
                    "api_schema": {
                        "url": f"{base_url}/api/v1/tools/{tool_name}",
                        "method": "POST",
                        "request_headers": {
                            "X-Voxara-Secret": agent.signing_secret,
                            "X-Agent-Id": agent.id,
                        },
                        "request_body_schema": meta["parameters"],
                    },
                })

        # ── Custom user-created tools (webhook | client) ─────────────────────
        # MCP tools are attached via mcp_server_ids in the prompt block — skip here.
        for ct in custom_tools:
            el_type = ct.get("el_tool_type", "webhook")
            if el_type == "mcp":
                continue
            # Description override: check tool_configs by tool name or id
            ct_name = ct["name"]
            ct_custom_desc = (
                tool_configs.get(ct_name, {}).get("description")
                or tool_configs.get(ct.get("id", ""), {}).get("description")
            )
            ct_description = ct_custom_desc if ct_custom_desc else ct["description"]

            if el_type == "client":
                defs.append({
                    "type": "client",
                    "name": ct_name,
                    "description": ct_description,
                    "parameters": ct.get("tool_parameters", []),
                    "expects_response": ct.get("expects_response", False),
                    "response_timeout_secs": ct.get("response_timeout_secs", 20),
                    "disable_interruptions": ct.get("disable_interruptions", False),
                    "execution_mode": ct.get("execution_mode", "immediate"),
                    "pre_tool_speech": ct.get("pre_tool_speech", "auto"),
                })
            else:
                # webhook and mcp both call back to our proxy
                defs.append({
                    "type": "webhook",
                    "name": ct_name,
                    "description": ct_description,
                    "api_schema": {
                        "url": f"{base_url}/api/v1/tools/custom/{ct['id']}",
                        "method": "POST",
                        "request_headers": {
                            "X-Voxara-Secret": agent.signing_secret,
                            "X-Agent-Id": agent.id,
                        },
                        "request_body_schema": ct["parameters_schema"],
                    },
                    "response_timeout_secs": ct.get("response_timeout_secs", 20),
                    "disable_interruptions": ct.get("disable_interruptions", False),
                })

        return defs


elevenlabs_service = ElevenLabsService()
