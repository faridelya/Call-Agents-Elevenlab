from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.agent import Agent
from app.models.call import Call
from app.models.campaign import Campaign
from app.models.lead import Lead
from app.models.phone_number import PhoneNumber
from app.models.tool import Tool


async def get_agent_or_404(agent_id: str, user_id: str, db: AsyncSession) -> Agent:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise NotFoundError("Agent not found")
    if agent.user_id != user_id:
        raise ForbiddenError()
    return agent


async def get_call_or_404(call_id: str, user_id: str, db: AsyncSession) -> Call:
    result = await db.execute(select(Call).where(Call.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise NotFoundError("Call not found")
    if call.user_id != user_id:
        raise ForbiddenError()
    return call


async def get_campaign_or_404(campaign_id: str, user_id: str, db: AsyncSession) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise NotFoundError("Campaign not found")
    if campaign.user_id != user_id:
        raise ForbiddenError()
    return campaign


async def get_lead_or_404(lead_id: str, user_id: str, db: AsyncSession) -> Lead:
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise NotFoundError("Lead not found")
    if lead.user_id != user_id:
        raise ForbiddenError()
    return lead


async def get_phone_number_or_404(number_id: str, user_id: str, db: AsyncSession) -> PhoneNumber:
    result = await db.execute(select(PhoneNumber).where(PhoneNumber.id == number_id))
    number = result.scalar_one_or_none()
    if not number:
        raise NotFoundError("Phone number not found")
    if number.user_id != user_id:
        raise ForbiddenError()
    return number


async def get_tool_or_404(tool_id: str, user_id: str, db: AsyncSession) -> Tool:
    result = await db.execute(select(Tool).where(Tool.id == tool_id))
    tool = result.scalar_one_or_none()
    if not tool:
        raise NotFoundError("Tool not found")
    if tool.user_id != user_id:
        raise ForbiddenError()
    return tool
