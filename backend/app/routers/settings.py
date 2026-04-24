from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import MessageResponse
from app.utils.crypto import encrypt

router = APIRouter(prefix="/settings", tags=["settings"])


class TwilioCredentials:
    account_sid: str
    auth_token: str


@router.post("/twilio", response_model=MessageResponse)
async def save_twilio_credentials(
    account_sid: str,
    auth_token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Store user's own Twilio credentials (BYO Twilio)."""
    current_user.twilio_account_sid = account_sid
    current_user.twilio_auth_token = encrypt(auth_token)
    await db.commit()
    return MessageResponse(message="Twilio credentials saved")


@router.get("/billing")
async def get_billing(current_user: User = Depends(get_current_user)):
    """Return the user's current subscription tier, status, and Stripe customer ID."""
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
    """Return lifetime usage totals: total calls placed and total minutes consumed."""
    from sqlalchemy import select, func
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
    """List configured third-party integrations and their connection status."""
    return {
        "integrations": [
            {
                "type": "twilio",
                "connected": bool(current_user.twilio_account_sid),
                "description": "Telephony provider",
            },
        ]
    }
