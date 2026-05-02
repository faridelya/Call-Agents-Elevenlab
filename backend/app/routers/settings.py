from datetime import datetime, timezone

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.db.redis import get_redis
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import MessageResponse
from app.utils.crypto import encrypt, decrypt

router = APIRouter(prefix="/settings", tags=["settings"])


def _mask(value: str | None) -> str | None:
    if not value:
        return None
    return value[:4] + "•" * (len(value) - 8) + value[-4:] if len(value) > 8 else "••••"


def _safe_decrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return decrypt(value)
    except Exception:
        return value


class CredentialsResponse(BaseModel):
    twilio_account_sid: str | None = None
    twilio_auth_token_masked: str | None = None
    elevenlabs_api_key_masked: str | None = None
    elevenlabs_webhook_secret_masked: str | None = None
    openai_api_key_masked: str | None = None
    google_api_key_masked: str | None = None
    anthropic_api_key_masked: str | None = None
    twilio_connected: bool = False
    elevenlabs_connected: bool = False
    elevenlabs_webhook_configured: bool = False
    webhook_base_url: str


class CredentialsSaveRequest(BaseModel):
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_webhook_secret: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
    anthropic_api_key: str | None = None


class ElevenLabsInvoice(BaseModel):
    amount_due_cents: int | None = None
    subtotal_cents: int | None = None
    tax_cents: int | None = None
    currency: str | None = None
    payment_intent_status: str | None = None
    next_payment_attempt_unix: int | None = None


class ElevenLabsCostResponse(BaseModel):
    configured: bool
    tier: str = "unknown"
    status: str = "unknown"
    currency: str | None = None
    billing_period: str | None = None
    character_refresh_period: str | None = None
    character_count: int = 0
    character_limit: int = 0
    character_remaining: int = 0
    character_usage_percent: float = 0.0
    max_character_limit_extension: int | None = None
    can_extend_character_limit: bool = False
    allowed_to_extend_character_limit: bool = False
    next_character_count_reset_unix: int | None = None
    has_open_invoices: bool = False
    open_invoices: list[ElevenLabsInvoice] = []
    next_invoice: ElevenLabsInvoice | None = None
    warning_level: str = "ok"
    warning_message: str = ""
    cached: bool = False
    error: str | None = None


def _resolve_user_el_key(current_user: User) -> tuple[str, bool]:
    api_key = ""
    if current_user.elevenlabs_api_key:
        try:
            api_key = decrypt(current_user.elevenlabs_api_key)
        except Exception:
            api_key = current_user.elevenlabs_api_key
    if api_key:
        return api_key, True
    return settings.elevenlabs_api_key, False


def _invoice(data: dict | None, currency: str | None) -> ElevenLabsInvoice | None:
    if not data:
        return None
    return ElevenLabsInvoice(
        amount_due_cents=data.get("amount_due_cents"),
        subtotal_cents=data.get("subtotal_cents"),
        tax_cents=data.get("tax_cents"),
        currency=currency,
        payment_intent_status=data.get("payment_intent_status"),
        next_payment_attempt_unix=data.get("next_payment_attempt_unix"),
    )


def _normalize_el_cost(data: dict, *, configured: bool, cached: bool = False) -> ElevenLabsCostResponse:
    if data.get("error"):
        return ElevenLabsCostResponse(
            configured=configured,
            cached=cached,
            error=str(data.get("error")),
            warning_level="error",
            warning_message="Unable to fetch ElevenLabs usage. Verify the API key and try again.",
        )

    count = int(data.get("character_count") or 0)
    limit = int(data.get("character_limit") or 0)
    remaining = max(limit - count, 0) if limit else 0
    usage_percent = round((count / limit) * 100, 1) if limit else 0.0
    status = data.get("status") or "unknown"
    tier = data.get("tier") or "unknown"
    can_extend = bool(data.get("can_extend_character_limit"))
    allowed_extend = bool(data.get("allowed_to_extend_character_limit"))
    has_open_invoices = bool(data.get("has_open_invoices"))

    warning_level = "ok"
    warning_message = "ElevenLabs usage is within the normal range."
    if status not in ("active", "free", "trial"):
        warning_level = "error"
        warning_message = f"Subscription status is {status}. Calls may fail until billing is resolved."
    elif limit and count >= limit and not (can_extend and allowed_extend):
        warning_level = "critical"
        warning_message = "ElevenLabs character quota is exhausted. Conversations may drop or fail."
    elif limit and usage_percent >= 90:
        warning_level = "critical"
        warning_message = "ElevenLabs quota is almost finished. Add usage or upgrade before more calls."
    elif limit and usage_percent >= 75:
        warning_level = "warning"
        warning_message = "ElevenLabs quota is above 75%. Monitor usage before running campaigns."
    if has_open_invoices and warning_level == "ok":
        warning_level = "warning"
        warning_message = "There are open ElevenLabs invoices. Billing issues can interrupt calls."

    currency = data.get("currency")
    open_invoices = [
        inv for inv in (_invoice(raw, currency) for raw in data.get("open_invoices", [])) if inv is not None
    ]

    return ElevenLabsCostResponse(
        configured=configured,
        tier=tier,
        status=status,
        currency=currency,
        billing_period=data.get("billing_period"),
        character_refresh_period=data.get("character_refresh_period"),
        character_count=count,
        character_limit=limit,
        character_remaining=remaining,
        character_usage_percent=usage_percent,
        max_character_limit_extension=data.get("max_character_limit_extension"),
        can_extend_character_limit=can_extend,
        allowed_to_extend_character_limit=allowed_extend,
        next_character_count_reset_unix=data.get("next_character_count_reset_unix"),
        has_open_invoices=has_open_invoices,
        open_invoices=open_invoices,
        next_invoice=_invoice(data.get("next_invoice"), currency),
        warning_level=warning_level,
        warning_message=warning_message,
        cached=cached,
    )


@router.get("/credentials", response_model=CredentialsResponse)
async def get_credentials(current_user: User = Depends(get_current_user)):
    """Return masked credential values and connection status."""
    el_key = _safe_decrypt(current_user.elevenlabs_api_key)
    el_webhook_secret = _safe_decrypt(current_user.elevenlabs_webhook_secret)
    tw_token = _safe_decrypt(current_user.twilio_auth_token)
    openai_key = _safe_decrypt(current_user.openai_api_key)
    google_key = _safe_decrypt(current_user.google_api_key)
    anthropic_key = _safe_decrypt(current_user.anthropic_api_key)
    return CredentialsResponse(
        twilio_account_sid=current_user.twilio_account_sid,
        twilio_auth_token_masked=_mask(tw_token),
        elevenlabs_api_key_masked=_mask(el_key),
        elevenlabs_webhook_secret_masked=_mask(el_webhook_secret),
        openai_api_key_masked=_mask(openai_key),
        google_api_key_masked=_mask(google_key),
        anthropic_api_key_masked=_mask(anthropic_key),
        twilio_connected=bool(current_user.twilio_account_sid and current_user.twilio_auth_token),
        elevenlabs_connected=bool(current_user.elevenlabs_api_key),
        elevenlabs_webhook_configured=bool(current_user.elevenlabs_webhook_secret),
        webhook_base_url=settings.public_url,
    )


@router.patch("/credentials", response_model=MessageResponse)
async def save_credentials(
    body: CredentialsSaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Save user's own API credentials. Only provided fields are updated."""
    if body.twilio_account_sid is not None:
        current_user.twilio_account_sid = body.twilio_account_sid or None
    if body.twilio_auth_token is not None:
        current_user.twilio_auth_token = encrypt(body.twilio_auth_token) if body.twilio_auth_token else None
    if body.elevenlabs_api_key is not None:
        current_user.elevenlabs_api_key = encrypt(body.elevenlabs_api_key) if body.elevenlabs_api_key else None
    if body.elevenlabs_webhook_secret is not None:
        current_user.elevenlabs_webhook_secret = encrypt(body.elevenlabs_webhook_secret) if body.elevenlabs_webhook_secret else None
    if body.openai_api_key is not None:
        current_user.openai_api_key = encrypt(body.openai_api_key) if body.openai_api_key else None
    if body.google_api_key is not None:
        current_user.google_api_key = encrypt(body.google_api_key) if body.google_api_key else None
    if body.anthropic_api_key is not None:
        current_user.anthropic_api_key = encrypt(body.anthropic_api_key) if body.anthropic_api_key else None
    await db.commit()
    if body.elevenlabs_api_key is not None:
        await redis.delete(f"el_plan:{current_user.id}", f"el_cost:{current_user.id}")
    return MessageResponse(message="Credentials saved")


@router.post("/twilio", response_model=MessageResponse)
async def save_twilio_credentials(
    account_sid: str,
    auth_token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Legacy endpoint — use PATCH /credentials instead."""
    current_user.twilio_account_sid = account_sid
    current_user.twilio_auth_token = encrypt(auth_token)
    await db.commit()
    return MessageResponse(message="Twilio credentials saved")


@router.get("/billing")
async def get_billing(current_user: User = Depends(get_current_user)):
    return {
        "subscription_tier": current_user.subscription_tier,
        "subscription_status": current_user.subscription_status,
        "stripe_customer_id": current_user.stripe_customer_id,
    }


@router.get("/usage")
async def get_usage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.call import Call
    total_calls = (await db.execute(select(func.count()).select_from(Call).where(Call.user_id == current_user.id))).scalar()
    total_minutes = (await db.execute(
        select(func.sum(Call.duration_seconds)).where(Call.user_id == current_user.id)
    )).scalar() or 0
    return {
        "total_calls": total_calls,
        "total_minutes": round(total_minutes / 60, 1),
    }


@router.get("/el-plan")
async def get_el_plan(
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis),
):
    """Return ElevenLabs subscription tier for the current user's API key.

    Result is cached in Redis for 1 hour to avoid repeated EL API calls.
    Returns {tier: str, is_enterprise: bool}.
    """
    from app.services.elevenlabs_service import elevenlabs_service

    api_key, _ = _resolve_user_el_key(current_user)

    if not api_key:
        return {"tier": "unknown", "is_enterprise": False}

    cache_key = f"el_plan:{current_user.id}"
    cached = await redis.get(cache_key)
    if cached:
        raw = cached if isinstance(cached, str) else cached.decode()
        return json.loads(raw)

    result = await elevenlabs_service.get_subscription_tier(api_key)
    await redis.set(cache_key, json.dumps(result), ex=3600)
    return result


@router.get("/elevenlabs/cost", response_model=ElevenLabsCostResponse)
async def get_elevenlabs_cost(
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis),
):
    """Return ElevenLabs quota, invoice, and warning information.

    ElevenLabs exposes character usage instead of a direct wallet balance. This
    endpoint normalizes that into remaining quota and warning levels for the UI.
    """
    from app.services.elevenlabs_service import elevenlabs_service

    api_key, user_configured = _resolve_user_el_key(current_user)
    configured = bool(api_key)
    if not api_key:
        return ElevenLabsCostResponse(
            configured=False,
            warning_level="error",
            warning_message="ElevenLabs API key is not configured.",
            error="missing_api_key",
        )

    cache_key = f"el_cost:{current_user.id}"
    cached = await redis.get(cache_key)
    if cached:
        raw = cached if isinstance(cached, str) else cached.decode()
        return _normalize_el_cost(json.loads(raw), configured=configured, cached=True)

    data = await elevenlabs_service.get_subscription_usage(api_key)
    await redis.set(cache_key, json.dumps(data), ex=300)
    return _normalize_el_cost(data, configured=user_configured or bool(settings.elevenlabs_api_key), cached=False)


@router.get("/integrations")
async def list_integrations(current_user: User = Depends(get_current_user)):
    return {
        "integrations": [
            {"type": "twilio", "connected": bool(current_user.twilio_account_sid), "description": "Telephony provider"},
            {"type": "elevenlabs", "connected": bool(current_user.elevenlabs_api_key), "description": "AI voice engine"},
        ]
    }
