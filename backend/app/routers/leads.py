import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_lead_or_404
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.base import new_uuid
from app.models.call import Call
from app.models.lead import Lead
from app.models.user import User
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.lead import DoNotCallRequest, LeadCreate, LeadResponse, LeadUpdate

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("", response_model=PaginatedResponse[LeadResponse])
async def list_leads(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    lead_status: str | None = None,
    do_not_call: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated leads with optional full-text search across name/email/phone/company and status/DNC filters."""
    filters = [Lead.user_id == current_user.id]
    if search:
        filters.append(or_(
            Lead.first_name.ilike(f"%{search}%"),
            Lead.last_name.ilike(f"%{search}%"),
            Lead.email.ilike(f"%{search}%"),
            Lead.phone.ilike(f"%{search}%"),
            Lead.company.ilike(f"%{search}%"),
        ))
    if lead_status:
        filters.append(Lead.lead_status == lead_status)
    if do_not_call is not None:
        filters.append(Lead.do_not_call == do_not_call)

    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count()).select_from(Lead).where(*filters))).scalar()
    result = await db.execute(
        select(Lead).where(*filters).order_by(Lead.created_at.desc()).offset(offset).limit(page_size)
    )
    return PaginatedResponse(items=result.scalars().all(), total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    body: LeadCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a single lead record. Phone is required; all other fields are optional."""
    lead = Lead(id=new_uuid(), user_id=current_user.id, **body.model_dump())
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch a lead by ID. Returns 404 if it doesn't exist or belongs to another user."""
    return await get_lead_or_404(lead_id, current_user.id, db)


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    body: LeadUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update lead fields (PATCH semantics — only supplied fields are changed)."""
    lead = await get_lead_or_404(lead_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(lead, field, value)
    await db.commit()
    await db.refresh(lead)
    return lead


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a lead record."""
    lead = await get_lead_or_404(lead_id, current_user.id, db)
    await db.delete(lead)
    await db.commit()


@router.get("/{lead_id}/calls")
async def get_lead_calls(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all calls associated with this lead, ordered by most recent first."""
    await get_lead_or_404(lead_id, current_user.id, db)
    result = await db.execute(
        select(Call).where(Call.lead_id == lead_id).order_by(Call.created_at.desc())
    )
    return {"calls": result.scalars().all()}


@router.post("/{lead_id}/do-not-call", response_model=MessageResponse)
async def mark_do_not_call(
    lead_id: str,
    body: DoNotCallRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a lead to the Do Not Call list. The DNC flag is checked before every outbound dial."""
    lead = await get_lead_or_404(lead_id, current_user.id, db)
    lead.do_not_call = True
    lead.do_not_call_reason = body.reason
    await db.commit()
    return MessageResponse(message="Lead marked as Do Not Call")


@router.delete("/{lead_id}/do-not-call", response_model=MessageResponse)
async def remove_do_not_call(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the Do Not Call flag from a lead so they can be dialed again."""
    lead = await get_lead_or_404(lead_id, current_user.id, db)
    lead.do_not_call = False
    lead.do_not_call_reason = None
    await db.commit()
    return MessageResponse(message="Do Not Call flag removed")


@router.post("/import", response_model=MessageResponse)
async def import_leads_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-import leads from a CSV file. Required column: `phone`. Duplicate phones are silently skipped."""
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    imported = 0
    skipped = 0

    for row in reader:
        phone = row.get("phone") or row.get("Phone") or row.get("phone_number", "").strip()
        if not phone:
            skipped += 1
            continue

        existing = await db.execute(select(Lead).where(Lead.user_id == current_user.id, Lead.phone == phone))
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        lead = Lead(
            id=new_uuid(),
            user_id=current_user.id,
            phone=phone,
            first_name=row.get("first_name") or row.get("First Name", "").strip() or None,
            last_name=row.get("last_name") or row.get("Last Name", "").strip() or None,
            email=row.get("email") or row.get("Email", "").strip() or None,
            company=row.get("company") or row.get("Company", "").strip() or None,
            title=row.get("title") or row.get("Title", "").strip() or None,
        )
        db.add(lead)
        imported += 1

    await db.commit()
    return MessageResponse(message=f"Imported {imported} leads, skipped {skipped}")


@router.get("/export")
async def export_leads_csv(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export all leads as a CSV file download (Content-Disposition: attachment)."""
    result = await db.execute(select(Lead).where(Lead.user_id == current_user.id).order_by(Lead.created_at.desc()))
    leads = result.scalars().all()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["phone", "first_name", "last_name", "email", "company", "title", "lead_status", "do_not_call", "total_calls"])
    writer.writeheader()
    for lead in leads:
        writer.writerow({
            "phone": lead.phone, "first_name": lead.first_name, "last_name": lead.last_name,
            "email": lead.email, "company": lead.company, "title": lead.title,
            "lead_status": lead.lead_status, "do_not_call": lead.do_not_call, "total_calls": lead.total_calls,
        })

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"},
    )
