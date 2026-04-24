from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import ExternalServiceError
from app.core.permissions import get_phone_number_or_404
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.base import new_uuid
from app.models.phone_number import PhoneNumber
from app.models.user import User
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.phone_number import AvailableNumberSearch, PhoneNumberProvision, PhoneNumberResponse, PhoneNumberUpdate
from app.services.twilio_service import get_twilio_service
from app.utils.twiml import build_stream_twiml

router = APIRouter(prefix="/phone-numbers", tags=["phone-numbers"])


@router.get("", response_model=PaginatedResponse[PhoneNumberResponse])
async def list_phone_numbers(
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all Twilio phone numbers provisioned under this account."""
    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count()).select_from(PhoneNumber).where(PhoneNumber.user_id == current_user.id))).scalar()
    result = await db.execute(
        select(PhoneNumber).where(PhoneNumber.user_id == current_user.id).order_by(PhoneNumber.created_at.desc()).offset(offset).limit(page_size)
    )
    return PaginatedResponse(items=result.scalars().all(), total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.get("/available")
async def search_available_numbers(
    country: str = "US",
    area_code: str | None = None,
    contains: str | None = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    """Search Twilio for available phone numbers by country, area code, or digit pattern."""
    twilio = get_twilio_service(current_user)
    numbers = await twilio.search_available_numbers(country=country, area_code=area_code, contains=contains, limit=limit)
    return {"available_numbers": numbers}


@router.post("", response_model=PhoneNumberResponse, status_code=status.HTTP_201_CREATED)
async def provision_number(
    body: PhoneNumberProvision,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Purchase a Twilio number, configure its inbound webhook to Voxara, and store it in the DB."""
    twilio = get_twilio_service(current_user)
    inbound_url = f"{settings.public_url}/api/v1/webhooks/twilio/inbound"
    status_url = f"{settings.public_url}/api/v1/webhooks/twilio/status"

    result = await twilio.purchase_number(
        phone_number=body.phone_number,
        voice_url=inbound_url,
        status_callback=status_url,
    )

    number = PhoneNumber(
        id=new_uuid(),
        user_id=current_user.id,
        phone_number=body.phone_number,
        friendly_name=body.friendly_name or result.get("friendly_name"),
        country_code=body.phone_number[1:3] if body.phone_number.startswith("+") else None,
        capabilities=result.get("capabilities", {}),
        twilio_sid=result["sid"],
        twilio_account_sid=result.get("account_sid"),
        inbound_enabled=bool(body.inbound_agent_id),
        inbound_agent_id=body.inbound_agent_id,
        monthly_cost=float(result.get("monthly_rental_rate", 0) or 0),
        purchased_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(number)
    await db.commit()
    await db.refresh(number)
    return number


@router.patch("/{number_id}", response_model=PhoneNumberResponse)
async def update_number(
    number_id: str,
    body: PhoneNumberUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a phone number's friendly name, inbound-enabled flag, or assigned inbound agent."""
    number = await get_phone_number_or_404(number_id, current_user.id, db)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(number, field, value)

    await db.commit()
    await db.refresh(number)
    return number


@router.delete("/{number_id}", status_code=status.HTTP_204_NO_CONTENT)
async def release_number(
    number_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Release a Twilio number (stops billing) and mark it inactive. Twilio release failures are non-fatal."""
    number = await get_phone_number_or_404(number_id, current_user.id, db)
    twilio = get_twilio_service(current_user)

    try:
        await twilio.release_number(number.twilio_sid)
    except ExternalServiceError:
        pass

    number.is_active = False
    number.released_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
