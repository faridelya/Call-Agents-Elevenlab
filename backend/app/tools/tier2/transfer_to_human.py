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
from html import escape
from urllib.parse import urlencode

import structlog
from sqlalchemy import select

from app.tools.registry import register_tool
from app.tools.schemas import CallContext
from app.config import settings
from app.models.user import User
from app.utils.crypto import decrypt

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


async def _resolve_twilio_credentials(ctx: CallContext, db) -> tuple[str, str, str]:
    """Return account SID/auth token for the Twilio account that owns this call."""
    account_sid = ""
    auth_token = ""
    credential_source = "missing"

    if ctx.user_id:
        result = await db.execute(select(User).where(User.id == ctx.user_id))
        user = result.scalar_one_or_none()
        if user and user.twilio_account_sid and user.twilio_auth_token:
            account_sid = user.twilio_account_sid
            try:
                auth_token = decrypt(user.twilio_auth_token)
            except Exception:
                auth_token = user.twilio_auth_token
            credential_source = "user"

    if not account_sid or not auth_token:
        account_sid = settings.twilio_account_sid
        auth_token = settings.twilio_auth_token
        credential_source = "platform" if account_sid and auth_token else "missing"

    return account_sid, auth_token, credential_source


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

    # Configurable messages — fall back to sensible defaults if not set
    unavailable_msg: str = (cfg.get("unavailable_message") or "").strip() or (
        "I'm sorry — I wasn't able to connect you to a human agent because "
        "no transfer number has been configured. Please contact us directly "
        "and I'll do everything I can to help you in the meantime."
    )
    config_error_msg: str = (cfg.get("config_error_message") or "").strip() or (
        "I'm sorry — the transfer could not be completed due to a "
        "configuration issue. I apologize for the inconvenience. "
        "Is there anything I can help you with directly?"
    )
    connecting_msg: str = (cfg.get("connecting_message") or "").strip() or (
        "Connecting you now — please hold while we transfer your call."
    )

    if not transfer_to:
        log.warning(
            "transfer_no_number_configured",
            call_record_id=ctx.call_record_id,
            agent_id=ctx.agent_id,
        )
        return unavailable_msg

    if not _E164_RE.match(transfer_to):
        log.error(
            "transfer_invalid_number_format",
            number=transfer_to,
            call_record_id=ctx.call_record_id,
        )
        return config_error_msg

    # ── 2. Determine transfer type ────────────────────────────────────────────
    transfer_type = (
        params.get("transfer_type") or cfg.get("mode") or "cold"
    ).lower()
    if transfer_type not in {"warm", "cold"}:
        transfer_type = "cold"
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

    account_sid, auth_token, credential_source = await _resolve_twilio_credentials(ctx, db)
    if not account_sid or not auth_token:
        log.error(
            "transfer_twilio_creds_missing",
            call_record_id=ctx.call_record_id,
            user_id=ctx.user_id,
        )
        return (
            f"The transfer could not be completed — Twilio is not configured. "
            f"Please reach us at {_readable_number(transfer_to)}."
        )

    # ── 4. Stamp transfer metadata in Redis ───────────────────────────────────
    # post_transfer_outcome is configurable per-agent; defaults to "transferred_to_human".
    # post_call_processing reads this so the outcome label doesn't get overridden by EL/LLM.
    post_transfer_outcome = (cfg.get("post_transfer_outcome") or "transferred_to_human").strip()

    now_iso = datetime.now(timezone.utc).isoformat()
    await redis.hset(
        f"call:{ctx.call_record_id}",
        mapping={
            "transferred": "1",
            "transferred_to": transfer_to,
            "transfer_type": transfer_type,
            "transfer_reason": reason,
            "transferred_at": now_iso,
            "forced_outcome": post_transfer_outcome,
        },
    )
    log.info(
        "transfer_initiated",
        call_record_id=ctx.call_record_id,
        call_sid=call_sid,
        transfer_to=transfer_to,
        transfer_type=transfer_type,
        credential_source=credential_source,
        reason=reason or "(none)",
    )

    # ── 5. Build redirect TwiML ───────────────────────────────────────────────
    base = settings.public_url
    fallback_qs = urlencode({"call_record_id": ctx.call_record_id, "transfer_to": transfer_to})
    recording_qs = urlencode({"call_record_id": ctx.call_record_id, "is_transfer": "1"})
    fallback_url = f"{base}/api/v1/webhooks/twilio/transfer-fallback?{fallback_qs}"
    recording_cb = f"{base}/api/v1/webhooks/twilio/recording?{recording_qs}"

    # <Dial action> fires when the dialed leg ends (answered, busy, no-answer, failed).
    # recordingChannels="dual" separates customer (ch0) and human agent (ch1) into
    # distinct stereo tracks so transcription needs no speaker-guessing heuristic.
    fallback_attr = escape(fallback_url, quote=True)
    recording_attr = escape(recording_cb, quote=True)
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f'<Dial action="{fallback_attr}" method="POST" timeout="30" '
        f'record="record-from-answer" recordingChannels="dual" '
        f'recordingStatusCallback="{recording_attr}">'
        f"<Number>{transfer_to}</Number>"
        "</Dial>"
        "</Response>"
    )

    # ── 6. Redirect the live Twilio call via REST API (with auto-retry) ──────────
    from app.services.twilio_service import TwilioService
    from app.core.exceptions import ExternalServiceError

    twilio_service = TwilioService(account_sid=account_sid, auth_token=auth_token)
    log.info(
        "transfer_redirect_attempt",
        call_record_id=ctx.call_record_id,
        call_sid=call_sid,
        transfer_to=transfer_to,
        transfer_type=transfer_type,
        credential_source=credential_source,
        account_sid_prefix=account_sid[:8] if account_sid else "MISSING",
    )
    try:
        await twilio_service.redirect_call(call_sid, twiml)
        log.info(
            "transfer_redirect_ok",
            call_record_id=ctx.call_record_id,
            call_sid=call_sid,
            transfer_to=transfer_to,
            transfer_type=transfer_type,
            credential_source=credential_source,
        )

    except ExternalServiceError as exc:
        error_msg = str(exc)
        log.error(
            "transfer_redirect_failed",
            call_sid=call_sid,
            credential_source=credential_source,
            account_sid_prefix=account_sid[:8] if account_sid else "MISSING",
            error=error_msg,
        )
        await redis.hset(
            f"call:{ctx.call_record_id}",
            "transfer_fallback_status",
            "redirect_failed",
        )
        failed_msg = (cfg.get("transfer_failed_message") or "").strip() or (
            f"I was unable to complete the transfer at this time. "
            f"You can reach our team directly at {_readable_number(transfer_to)}. "
            f"I apologize for the inconvenience."
        )
        return failed_msg

    return connecting_msg
