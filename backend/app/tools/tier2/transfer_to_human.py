"""
Transfer to Human Agent — redirects the live Twilio call via the REST API.

Flow:
  1. ElevenLabs calls this webhook when the agent decides to transfer
  2. We resolve the target number from tool_configs (agent admin configured it)
  3. We validate the number and the Twilio call SID
  4. We stamp transfer metadata in Redis for transcript annotation
  5. We POST to Twilio's REST API, replacing the active call TwiML with <Dial>
  6. Twilio immediately starts ringing the human agent while the customer hears hold
  7. If the human agent answers → both sides connected, EL conversation ends naturally
  8. If busy / no-answer / failed → Twilio POSTs to our /transfer-fallback endpoint
     which speaks a graceful unavailability message and hangs up

Announcement:
  The tool description instructs EL to announce the transfer BEFORE calling this
  tool. By the time Twilio receives our redirect, the customer has already been told.
  The 2-3 second Twilio API round-trip gives EL just enough time to finish speaking.

Why server-side webhook (not "client"):
  In the native Twilio/EL integration there is no JS client. "client" tools are
  silently dropped. This must be a webhook so our endpoint actually executes.
"""
import re
from datetime import datetime, timezone

import httpx
import structlog

from app.tools.registry import register_tool
from app.tools.schemas import CallContext
from app.config import settings

log = structlog.get_logger(__name__)

# The transfer number is NOT a parameter — EL doesn't need to know it.
# It is configured once in the agent's tool_configs and read at call time.
# This prevents the AI from guessing or hallucinating a number.
PARAMS = {
    "type": "object",
    "properties": {
        "reason": {
            "type": "string",
            "description": (
                "Brief reason for the transfer, e.g. 'billing dispute', "
                "'complex technical issue', 'customer request'. Logged for QA."
            ),
        },
        "transfer_type": {
            "type": "string",
            "enum": ["warm", "cold"],
            "description": (
                "'cold' = immediate direct transfer (default). "
                "'warm' = signals intent to brief the agent before connecting — "
                "use this when the customer needs a warm handoff."
            ),
        },
    },
    "required": [],
}

_E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")


def _readable_number(e164: str) -> str:
    """Return a TTS-friendly spoken form of an E.164 number."""
    digits = e164.lstrip("+")
    if len(digits) == 11 and digits.startswith("1"):
        # North American: 1 (555) 123 4567
        return f"{digits[1:4]} {digits[4:7]} {digits[7:]}"
    # Generic: split into chunks of 3
    return " ".join(digits[i : i + 3] for i in range(0, len(digits), 3))


@register_tool(
    name="transfer_to_human",
    tier=2,
    execution="server",
    description=(
        "Transfer this call to a human agent. "
        "Trigger when: (1) the customer explicitly asks for a human, "
        "(2) you cannot resolve the issue after genuine effort, "
        "(3) the customer is highly upset or the matter requires personal judgment. "
        "REQUIRED: Before calling this tool you MUST say to the customer exactly: "
        "'I understand — let me connect you with one of our team members right away. "
        "Please hold for just a moment.' "
        "Call this tool immediately after saying that. Do not wait for a reply."
    ),
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    # ── 1. Resolve the transfer target number from tool_configs ───────────────
    cfg: dict = ctx.tool_configs.get("transfer_to_human", {})
    transfer_to: str = (cfg.get("transfer_to") or "").strip()

    if not transfer_to:
        log.warning(
            "transfer_no_number_configured",
            call_record_id=ctx.call_record_id,
            agent_id=ctx.agent_id,
        )
        return (
            "I'm sorry — I wasn't able to connect you to a human agent because "
            "no transfer number has been configured. Please contact us directly "
            "and I'll do everything I can to help you in the meantime."
        )

    if not _E164_RE.match(transfer_to):
        log.error(
            "transfer_invalid_number_format",
            number=transfer_to,
            call_record_id=ctx.call_record_id,
        )
        return (
            "I'm sorry — the transfer could not be completed due to a "
            "configuration issue. I apologize for the inconvenience. "
            "Is there anything I can help you with directly?"
        )

    # ── 2. Determine transfer type ────────────────────────────────────────────
    transfer_type = (
        params.get("transfer_type") or cfg.get("mode") or "cold"
    ).lower()
    reason = (params.get("reason") or "").strip()

    # ── 3. Resolve Twilio call SID ────────────────────────────────────────────
    call_sid = (ctx.call_sid or "").strip()
    if not call_sid:
        # Safety: read directly from Redis in case ctx was built before the SID landed
        raw = await redis.hget(f"call:{ctx.call_record_id}", "call_sid")
        call_sid = (raw if isinstance(raw, str) else (raw.decode() if raw else "")).strip()

    if not call_sid:
        log.error("transfer_no_call_sid", call_record_id=ctx.call_record_id)
        return (
            f"I wasn't able to complete the transfer at this moment. "
            f"You can reach our team directly at {_readable_number(transfer_to)}."
        )

    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        log.error("transfer_twilio_creds_missing", call_record_id=ctx.call_record_id)
        return (
            f"The transfer could not be completed — Twilio is not configured. "
            f"Please reach us at {_readable_number(transfer_to)}."
        )

    # ── 4. Stamp transfer metadata in Redis ───────────────────────────────────
    now_iso = datetime.now(timezone.utc).isoformat()
    await redis.hset(
        f"call:{ctx.call_record_id}",
        mapping={
            "transferred": "1",
            "transferred_to": transfer_to,
            "transfer_type": transfer_type,
            "transfer_reason": reason,
            "transferred_at": now_iso,
        },
    )
    log.info(
        "transfer_initiated",
        call_record_id=ctx.call_record_id,
        call_sid=call_sid,
        transfer_to=transfer_to,
        transfer_type=transfer_type,
        reason=reason or "(none)",
    )

    # ── 5. Build redirect TwiML ───────────────────────────────────────────────
    base = settings.public_url
    fallback_url = (
        f"{base}/api/v1/webhooks/twilio/transfer-fallback"
        f"?call_record_id={ctx.call_record_id}&transfer_to={transfer_to}"
    )
    recording_cb = (
        f"{base}/api/v1/webhooks/twilio/recording"
        f"?call_record_id={ctx.call_record_id}&is_transfer=1"
    )
    status_cb = f"{base}/api/v1/webhooks/twilio/status"

    # <Dial action> fires when the dialed leg ends (answered, busy, no-answer, failed).
    # record="record-from-answer" captures the human-agent leg for QA.
    # timeout="30" gives the human agent 30 seconds to pick up.
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f'<Dial action="{fallback_url}" method="POST" timeout="30" '
        f'record="record-from-answer" recordingStatusCallback="{recording_cb}">'
        f'<Number statusCallbackEvent="initiated ringing answered completed" '
        f'statusCallback="{status_cb}">{transfer_to}</Number>'
        "</Dial>"
        "</Response>"
    )

    # ── 6. Redirect the live Twilio call via REST API ─────────────────────────
    twilio_url = (
        f"https://api.twilio.com/2010-04-01/Accounts/"
        f"{settings.twilio_account_sid}/Calls/{call_sid}.json"
    )
    try:
        async with httpx.AsyncClient(
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            timeout=10.0,
        ) as client:
            r = await client.post(twilio_url, data={"Twiml": twiml})

        if r.status_code not in (200, 201):
            log.error(
                "transfer_twilio_update_failed",
                call_sid=call_sid,
                http_status=r.status_code,
                body=r.text[:300],
            )
            return (
                f"I was unable to complete the transfer at this time. "
                f"You can reach our team directly at {_readable_number(transfer_to)}. "
                f"I apologize for the inconvenience."
            )

        log.info(
            "transfer_redirect_ok",
            call_record_id=ctx.call_record_id,
            call_sid=call_sid,
            transfer_to=transfer_to,
            transfer_type=transfer_type,
        )

    except httpx.TimeoutException:
        log.error("transfer_twilio_timeout", call_sid=call_sid)
        return (
            f"The transfer timed out. Please try again or contact us directly "
            f"at {_readable_number(transfer_to)}."
        )
    except httpx.RequestError as exc:
        log.error("transfer_twilio_request_error", call_sid=call_sid, error=str(exc))
        return (
            f"The transfer couldn't be completed due to a network issue. "
            f"You can reach our team at {_readable_number(transfer_to)}."
        )

    return "Connecting you now — please hold while we transfer your call."
