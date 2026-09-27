from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from backend.app.db.session import get_db
from backend.app.models.event import Event as EventModel
from backend.app.schemas.event import Event
from backend.app.schemas.pagination import PaginatedResponse

router = APIRouter()

@router.get("/", response_model=PaginatedResponse[Event])
async def list_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    agent_id: Optional[int] = None,
    hostname: Optional[str] = None,
    operating_system: Optional[str] = None,
    source_type: Optional[str] = None,
    event_category: Optional[str] = None,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    action: Optional[str] = None,
    protocol: Optional[str] = None,
    source_ip: Optional[str] = None,
    destination_ip: Optional[str] = None,
    search: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import or_
    stmt = select(EventModel)

    # Filtering
    if agent_id:
        stmt = stmt.where(EventModel.agent_id == agent_id)
    if hostname:
        stmt = stmt.where(EventModel.hostname.ilike(f"%{hostname}%"))
    if operating_system:
        stmt = stmt.where(func.lower(EventModel.operating_system) == operating_system.lower())
    if source_type:
        stmt = stmt.where(EventModel.source_type == source_type)
    if event_category:
        stmt = stmt.where(EventModel.event_category == event_category)
    if event_type:
        stmt = stmt.where(EventModel.event_type == event_type)
    if severity:
        stmt = stmt.where(EventModel.severity == severity)
    if action:
        stmt = stmt.where(func.lower(EventModel.action) == action.lower())
    if protocol:
        stmt = stmt.where(func.lower(EventModel.protocol) == protocol.lower())
    if source_ip:
        stmt = stmt.where(EventModel.source_ip == source_ip)
    if destination_ip:
        stmt = stmt.where(EventModel.destination_ip == destination_ip)
    if search:
        search_term = f"%{search}%"
        stmt = stmt.where(or_(
            EventModel.username.ilike(search_term),
            EventModel.hostname.ilike(search_term),
            EventModel.event_type.ilike(search_term),
            EventModel.source_type.ilike(search_term)
        ))
    if start_time:
        stmt = stmt.where(EventModel.timestamp >= start_time)
    if end_time:
        if start_time and end_time < start_time:
            raise HTTPException(status_code=400, detail="end_time must be after start_time")
        stmt = stmt.where(EventModel.timestamp <= end_time)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Pagination & Sorting
    stmt = stmt.order_by(EventModel.timestamp.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    items = result.scalars().all()

    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/{id}", response_model=Event)
async def get_event(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EventModel).where(EventModel.id == id))
    event = result.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event
