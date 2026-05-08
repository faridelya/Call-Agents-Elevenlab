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
            "transfers": [
                {
                    "transfer_destination": {"type": "phone", "phone_number": ""},
                    "condition": "",
                    "transfer_type": "cold",
                    "custom_sip_headers": [],
                }
            ],
            "disable_interruptions": False,
            "tool_error_handling_mode": "auto",
        },
        "config_fields": [
            {
                "key": "transfers",
                "label": "Transfer Destinations",
                "type": "transfer_list",
                "description": "Define one or more destinations. The agent will use the first matching condition.",
            }
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

    Returns None if tool_key is not in the catalog.
    """
    meta = EL_SYSTEM_TOOLS.get(tool_key)
    if not meta:
        return None

    merged = {**meta["default_config"], **tool_config}

    return {
        "type": "system",
        "name": meta["system_tool_type"],
        "description": meta["description"],
        "params": {
            "system_tool_type": meta["system_tool_type"],
            **{k: v for k, v in merged.items()
               if k not in ("disable_interruptions", "tool_error_handling_mode")},
        },
        "disable_interruptions": merged.get("disable_interruptions", False),
        "tool_error_handling_mode": merged.get("tool_error_handling_mode", "auto"),
    }
