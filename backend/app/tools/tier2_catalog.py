"""Tier 2 server-side tool catalog.

These tools execute on our backend via webhook callbacks from ElevenLabs.
They are NOT registered via @register_tool (which is for the EL bridge executor).
Their metadata lives here so the /catalog API can expose them alongside
the registered tier-1/2 tools, and elevenlabs_service.py can build EL tool
definitions from a single source of truth.
"""

# Full metadata for each tier-2 server tool: description, parameters, default_config.
# The catalog endpoint merges these with the @register_tool registry.
TIER2_SERVER_CATALOG: dict[str, dict] = {
    "book_meeting": {
        "tier": 2,
        "execution": "server",
        "description": "Book a meeting or appointment for the contact via the configured calendar integration.",
        "parameters": {
            "type": "object",
            "properties": {
                "contact_name":   {"type": "string", "description": "Full name of the contact"},
                "preferred_date": {"type": "string", "description": "Preferred date/time, e.g. 'Tuesday afternoon'"},
                "meeting_type":   {"type": "string", "description": "Type of meeting: demo, discovery call, follow-up"},
            },
            "required": ["contact_name", "preferred_date"],
        },
        "default_config": {
            "calendar_provider": "cal.com",
            "calendar_id": "",
            "api_key": "",
        },
    },
    "send_followup_sms": {
        "tier": 2,
        "execution": "server",
        "description": "Send a follow-up SMS message to the contact after the call.",
        "parameters": {
            "type": "object",
            "properties": {
                "phone_number":     {"type": "string", "description": "Recipient phone number in E.164 format"},
                "message_template": {"type": "string", "description": "Optional custom message; uses default template if omitted"},
            },
            "required": ["phone_number"],
        },
        "default_config": {
            "message_template": "Thank you for your time today!",
        },
    },
    "lookup_product_info": {
        "tier": 2,
        "execution": "server",
        "description": "Look up product or pricing information from the agent's product catalog. The catalog is configured in the agent's Tools settings.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Product name, feature, or pricing question"},
            },
            "required": ["query"],
        },
        "default_config": {},
    },
    "check_crm_record": {
        "tier": 2,
        "execution": "server",
        "description": "Look up the contact's existing record in the CRM by phone number.",
        "parameters": {
            "type": "object",
            "properties": {
                "phone_number": {"type": "string", "description": "Phone number to look up"},
            },
            "required": ["phone_number"],
        },
        "default_config": {
            "provider": "hubspot",
            "api_key": "",
        },
    },
    "update_crm_record": {
        "tier": 2,
        "execution": "server",
        "description": "Push call outcome and notes to the contact's CRM record.",
        "parameters": {
            "type": "object",
            "properties": {
                "crm_id":     {"type": "string", "description": "CRM record ID"},
                "properties": {"type": "object", "description": "Key-value pairs to update"},
                "note":       {"type": "string", "description": "Note to add about this call"},
            },
            "required": ["crm_id"],
        },
        "default_config": {
            "provider": "hubspot",
            "api_key": "",
        },
    },
    "qualify_lead": {
        "tier": 2,
        "execution": "server",
        "description": "Score and qualify the lead based on the agent's configured criteria. Ask the contact each criterion question, then call this tool with their answers. A lead is qualified when they meet ≥60% of criteria.",
        "parameters": {
            "type": "object",
            "properties": {
                "answers": {"type": "object", "description": "Dict of criteria_key → contact's answer for each criterion"},
            },
            "required": ["answers"],
        },
        "default_config": {},
    },
}

# Default configs for tools registered via @register_tool that have configurable options.
# Used by the /catalog endpoint to augment registry entries.
REGISTERED_TOOL_DEFAULT_CONFIGS: dict[str, dict] = {
    "save_lead":        {},
    "get_contact_info": {},
    "end_call":         {},
    "get_call_script": {
        # Comma-separated list of custom sections; overrides DEFAULT_SECTIONS when non-empty
        "custom_sections": "",
    },
    "log_call_outcome": {
        # Comma-separated or JSON-array list of allowed outcomes; overrides default enum when non-empty
        "custom_outcomes": "",
    },
    "update_call_stage": {
        # Comma-separated or JSON-array list of allowed stages; overrides default enum when non-empty
        "custom_stages": "",
    },
    "transfer_to_human": {
        "transfer_to": "",
        "mode": "cold",
        # Configurable spoken messages — leave blank to use built-in defaults
        "connecting_message": (
            "Connecting you now — please hold while we transfer your call."
        ),
        "unavailable_message": (
            "I'm sorry — I wasn't able to connect you to a human agent because "
            "no transfer number has been configured. Please contact us directly "
            "and I'll do everything I can to help you in the meantime."
        ),
        "config_error_message": (
            "I'm sorry — the transfer could not be completed due to a "
            "configuration issue. I apologize for the inconvenience. "
            "Is there anything I can help you with directly?"
        ),
        "transfer_failed_message": (
            "I was unable to complete the transfer at this time. "
            "I apologize for the inconvenience."
        ),
    },
    "leave_voicemail": {
        "default_message": (
            "Hi, this is {{company_name}}. "
            "Sorry we missed you — we'll try again soon!"
        ),
    },
}
