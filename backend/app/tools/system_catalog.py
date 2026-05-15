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
            "ElevenLabs built-in call transfer. Routes the active call to a phone number "
            "using SIP REFER or cold/warm dial — no backend callback required."
        ),
        "icon": "phone-forward",
        "color": "#7C6EFA",
        "el_type": "system",
        "system_tool_type": "transfer_to_number",
        "default_config": {
            "transfer_to": "",
            "condition": "customer explicitly requests to speak with a human agent",
            "transfer_type": "conference",
            "disable_interruptions": False,
            "tool_error_handling_mode": "auto",
        },
        "config_fields": [
            {
                "key": "transfer_to",
                "label": "Transfer Phone Number",
                "type": "string",
                "description": "E.164 phone number to transfer the call to (e.g. +15551234567).",
            },
            {
                "key": "condition",
                "label": "Transfer Condition",
                "type": "string",
                "description": "When should the agent initiate the transfer? (natural language condition)",
            },
            {
                "key": "transfer_type",
                "label": "Transfer Type",
                "type": "select",
                "options": ["conference", "cold", "warm"],
                "description": "Type of transfer: conference (default), cold, or warm.",
            },
        ],
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
        transfer_to = (tool_config.get("transfer_to") or "").strip()
        if not transfer_to:
            # Don't include the tool if no phone number is configured
            return None

        condition = (
            tool_config.get("condition")
            or "customer explicitly requests to speak with a human"
        )
        transfer_type = tool_config.get("transfer_type") or "conference"
        raw_di = tool_config.get("disable_interruptions", False)
        disable_interruptions = raw_di if isinstance(raw_di, bool) else str(raw_di).lower() == "true"
        tool_error_handling_mode = tool_config.get("tool_error_handling_mode", "auto")

        # Allow custom description override from tool_configs
        custom_desc = (tool_config.get("description") or "").strip()
        description = custom_desc if custom_desc else meta["description"]

        return {
            "type": "system",
            "name": meta["system_tool_type"],
            "description": description,
            "params": {
                "system_tool_type": meta["system_tool_type"],
                "transfers": [
                    {
                        "transfer_destination": {
                            "type": "phone",
                            "phone_number": transfer_to,
                        },
                        "condition": condition,
                        "transfer_type": transfer_type,
                    }
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
