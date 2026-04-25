from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
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


@router.get("/integrations")
async def list_integrations(current_user: User = Depends(get_current_user)):
    return {
        "integrations": [
            {"type": "twilio", "connected": bool(current_user.twilio_account_sid), "description": "Telephony provider"},
            {"type": "elevenlabs", "connected": bool(current_user.elevenlabs_api_key), "description": "AI voice engine"},
        ]
    }
