"""ElevenLabs native system tool definitions.

These are EL-owned capabilities registered via the 'system' tool type in the
agent config.  They require no callback to our backend — EL handles them
internally.  The agent stores their configuration in:
  agent.enabled_tools  → list includes the key (e.g. "el_transfer_to_number")
  agent.tool_configs   → key maps to the EL params dict

Knowledge Base is treated similarly but attaches via the agent's top-level
knowledge_base field rather than the tools array.
"""

EL_SYSTEM_TOOLS: dict[str, dict] = {
    "el_transfer_to_number": {
        "label": "Transfer to Number",
        "subtitle": "ElevenLabs Native",
        "description": (
            "ElevenLabs built-in call transfer. Routes the active call to a configured "
            "phone number — no backend callback required. Supports multiple departments "
            "with per-rule routing conditions, client hold messages, and agent briefings."
        ),
        "icon": "phone-forward",
        "color": "#7C6EFA",
        "el_type": "system",
        "system_tool_type": "transfer_to_number",
        "default_config": {
            # JSON array of transfer rules. transfer_type valid values per EL docs:
            #   "conference" — warm (default): adds to conference room, supports agent_message (Twilio native only)
            #   "blind"      — direct transfer, no agent_message, preserves caller ID (Twilio native only)
            #   "sip_refer"  — SIP REFER protocol, no agent_message, works with phone or SIP URI
            "transfers": '[{"id":"rule_1","number":"","condition":"customer explicitly requests to speak with a human","transfer_type":"conference","post_dial_digits":""}]',
            # client_message: what the customer hears while on hold
            #   "model" = LLM generates it per-call based on context
            #   "fixed"  = always use the text in client_message_fixed
            "client_message_mode": "model",
            "client_message_fixed": "Please hold while I connect you to our team.",
            # agent_message: spoken to the human agent when they pick up (warm transfer briefing)
            "agent_message_mode": "model",
            "agent_message_fixed": "",
            # Behaviour
            "disable_interruptions": False,
            "tool_error_handling_mode": "auto",
            # Legacy single-number fields kept for backward compat (no longer shown in UI)
            "transfer_to": "",
            "condition": "customer explicitly requests to speak with a human agent",
            "transfer_type": "conference",
        },
        "config_fields": [],  # UI-driven; not used by the generic renderer
    },
    "el_end_conversation": {
        "label": "End Conversation",
        "subtitle": "ElevenLabs Native",
        "description": (
            "Allows the ElevenLabs agent to cleanly end the conversation and hang up "
            "the call without additional backend logic."
        ),
        "icon": "phone-off",
        "color": "#EF4444",
        "el_type": "system",
        "system_tool_type": "end_conversation",
        "default_config": {
            "disable_interruptions": False,
            "tool_error_handling_mode": "auto",
        },
        "config_fields": [],
    },
    "el_language_detection": {
        "label": "Language Detection",
        "subtitle": "ElevenLabs Native",
        "description": (
            "Automatically detect the caller's language and switch the agent's "
            "response language accordingly."
        ),
        "icon": "globe",
        "color": "#22D3EE",
        "el_type": "system",
        "system_tool_type": "language_detection",
        "default_config": {
            "disable_interruptions": False,
            "tool_error_handling_mode": "auto",
        },
        "config_fields": [],
    },
}

# EL Knowledge Base is NOT a tool — it attaches to the agent-level knowledge_base
# field.  We surface it here for the UI to treat it uniformly.
EL_KNOWLEDGE_BASE_META = {
    "label": "Knowledge Base",
    "subtitle": "ElevenLabs Native",
    "description": (
        "Link an ElevenLabs Knowledge Base so the agent can query documents, "
        "FAQs, and product information during live calls. Create and manage "
        "knowledge bases in your ElevenLabs dashboard."
    ),
    "icon": "database",
    "color": "#10B981",
}


def build_system_tool_def(tool_key: str, tool_config: dict) -> dict | None:
    """Build the EL-format tool definition dict for a system tool.

    Returns None if tool_key is not in the catalog or if required config is
    missing (e.g. el_transfer_to_number without a transfer_to number).

    Special handling for el_transfer_to_number:
      Builds the correct nested params.transfers structure per EL's API spec.
      Only included when transfer_to is set — an empty phone number would
      cause EL to reject the agent config on sync.
    """
    meta = EL_SYSTEM_TOOLS.get(tool_key)
    if not meta:
        return None

    # ── Special case: el_transfer_to_number ───────────────────────────────────
    if tool_key == "el_transfer_to_number":
        import json as _json

        # ── Parse transfer rules (new multi-rule format) ──────────────────────
        raw_transfers = tool_config.get("transfers")
        transfer_rules: list[dict] = []
        if raw_transfers:
            if isinstance(raw_transfers, str):
                try:
                    transfer_rules = _json.loads(raw_transfers)
                except Exception:
                    pass
            elif isinstance(raw_transfers, list):
                transfer_rules = raw_transfers

        # Backward compat: legacy single transfer_to + condition fields
        if not transfer_rules:
            legacy_number = (tool_config.get("transfer_to") or "").strip()
            if legacy_number:
                transfer_rules = [{
                    "number": legacy_number,
                    "condition": tool_config.get("condition") or "customer requests to speak with a human",
                    "transfer_type": tool_config.get("transfer_type") or "conference",
                }]

        # Filter to rules that have a phone number
        valid_rules = [r for r in transfer_rules if (r.get("number") or "").strip()]
        if not valid_rules:
            return None  # No numbers configured — omit the tool from EL sync

        # ── client_message guidance ───────────────────────────────────────────
        # "model" = LLM generates a personalised message each call
        # "fixed" = always use the exact text configured by the user
        client_mode = (tool_config.get("client_message_mode") or "model").strip()
        client_fixed = (tool_config.get("client_message_fixed") or "").strip()
        if client_mode == "fixed" and client_fixed:
            client_guidance = (
                f'Always set client_message to exactly this text: "{client_fixed}" '
                f'— do not change or personalise it.'
            )
        else:
            client_guidance = (
                "Generate a natural, personalised client_message for the customer "
                "while they wait on hold — tailor it to the conversation context and "
                "reason for the transfer."
            )

        # ── agent_message guidance ────────────────────────────────────────────
        agent_mode = (tool_config.get("agent_message_mode") or "model").strip()
        agent_fixed = (tool_config.get("agent_message_fixed") or "").strip()
        if agent_mode == "fixed" and agent_fixed:
            agent_guidance = (
                f'Always set agent_message to exactly this text: "{agent_fixed}" '
                f'— do not change it.'
            )
        else:
            agent_guidance = (
                "Generate an agent_message that gives the human agent brief context "
                "about the customer and the reason for transfer before they are "
                "connected, e.g. 'AI transfer — customer is asking about a billing "
                "charge on their account. Name: [name if known].' Keep it concise."
            )

        # ── Transfer type note (for multi-rule agents) ────────────────────────
        if len(valid_rules) > 1:
            rule_summary = "; ".join(
                f'"{r.get("number", "")}": {r.get("condition", "")}'
                for r in valid_rules
            )
            routing_note = f" Routing rules — {rule_summary}."
        else:
            routing_note = ""

        custom_desc = (tool_config.get("description") or "").strip()
        base_desc = custom_desc if custom_desc else meta["description"]
        full_description = (
            f"{base_desc}{routing_note} "
            f"client_message: {client_guidance} "
            f"agent_message: {agent_guidance}"
        )

        raw_di = tool_config.get("disable_interruptions", False)
        disable_interruptions = raw_di if isinstance(raw_di, bool) else str(raw_di).lower() == "true"
        tool_error_handling_mode = tool_config.get("tool_error_handling_mode", "auto")

        return {
            "type": "system",
            "name": meta["system_tool_type"],
            "description": full_description,
            "params": {
                "system_tool_type": meta["system_tool_type"],
                "transfers": [
                    {
                        k: v for k, v in {
                            "transfer_destination": {
                                "type": "phone",
                                "phone_number": r.get("number", "").strip(),
                            },
                            "condition": r.get("condition") or "customer requests transfer",
                            "transfer_type": r.get("transfer_type") or "conference",
                            # post_dial_digits: optional DTMF digits after connect (Twilio native only)
                            # Only include when non-empty so the EL API doesn't see an empty string
                            **({"post_dial_digits": r["post_dial_digits"]} if r.get("post_dial_digits") else {}),
                        }.items()
                    }
                    for r in valid_rules
                ],
            },
            "disable_interruptions": disable_interruptions,
            "tool_error_handling_mode": tool_error_handling_mode,
        }

    # ── Generic system tools (el_end_conversation, el_language_detection) ────
    merged = {**meta["default_config"], **tool_config}

    # UI stores disable_interruptions as string "true"/"false" — coerce to bool for EL API.
    raw_di = merged.get("disable_interruptions", False)
    disable_interruptions = raw_di if isinstance(raw_di, bool) else str(raw_di).lower() == "true"

    # Allow custom description override from tool_configs
    custom_desc = (merged.get("description") or "").strip()
    description = custom_desc if custom_desc else meta["description"]

    return {
        "type": "system",
        "name": meta["system_tool_type"],
        "description": description,
        "params": {
            "system_tool_type": meta["system_tool_type"],
            **{k: v for k, v in merged.items()
               if k not in ("disable_interruptions", "tool_error_handling_mode", "description")},
        },
        "disable_interruptions": disable_interruptions,
        "tool_error_handling_mode": merged.get("tool_error_handling_mode", "auto"),
    }
