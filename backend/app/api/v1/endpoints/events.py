from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, cast, String, delete
from typing import Optional
from datetime import datetime

from backend.app.db.session import get_db
from backend.app.models.event import Event as EventModel
from backend.app.models.raw_log import RawLog as RawLogModel
from backend.app.models.view_clear_marker import ViewClearMarker
from backend.app.models.user import User
from backend.app.schemas.event import Event, ViewClearRequest, ViewClearMarkerResponse
from backend.app.schemas.pagination import PaginatedResponse
from backend.app.api.deps import require_analyst
from backend.app.core.audit import audit

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
    include_cleared: bool = Query(False, description="Whether to include events cleared from active views"),
    view_category: Optional[str] = Query(None, description="Category/tab identifier for view clear filtering (e.g. logs, live, authentication)"),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(EventModel)

    # Filtering
    if agent_id:
        stmt = stmt.where(EventModel.agent_id == agent_id)
    if hostname:
        stmt = stmt.where(EventModel.hostname.ilike(f"%{hostname}%"))
    if operating_system:
        stmt = stmt.where(EventModel.operating_system.ilike(f"%{operating_system}%"))
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
        stmt = stmt.outerjoin(RawLogModel, EventModel.raw_log_id == RawLogModel.id)
        stmt = stmt.where(or_(
            EventModel.event_id.ilike(search_term),
            EventModel.username.ilike(search_term),
            EventModel.hostname.ilike(search_term),
            EventModel.event_type.ilike(search_term),
            EventModel.event_category.ilike(search_term),
            EventModel.source_type.ilike(search_term),
            EventModel.severity.ilike(search_term),
            EventModel.action.ilike(search_term),
            EventModel.protocol.ilike(search_term),
            cast(EventModel.metadata_, String).ilike(search_term),
            RawLogModel.raw_payload.ilike(search_term),
            RawLogModel.event_identifier.ilike(search_term)
        ))
    if start_time:
        stmt = stmt.where(EventModel.timestamp >= start_time)
    if end_time:
        if start_time and end_time < start_time:
            raise HTTPException(status_code=400, detail="end_time must be after start_time")
        stmt = stmt.where(EventModel.timestamp <= end_time)

    # Apply non-destructive view-clear filter unless include_cleared is True
    if not include_cleared:
        cat_key = (view_category or event_category or "all").lower().strip()
        os_key = (operating_system or "").lower().strip()
        marker_stmt = select(func.max(ViewClearMarker.last_cleared_event_id))
        
        if os_key:
            marker_stmt = marker_stmt.where(
                or_(
                    ViewClearMarker.operating_system.ilike(f"%{os_key}%"),
                    ViewClearMarker.operating_system == "all"
                )
            )
        else:
            # Overall dashboard view: applies if 'all' OS marker exists
            marker_stmt = marker_stmt.where(ViewClearMarker.operating_system == "all")

        if cat_key:
            marker_stmt = marker_stmt.where(
                or_(
                    ViewClearMarker.category.ilike(cat_key),
                    ViewClearMarker.category == "all"
                )
            )
        marker_res = await db.execute(marker_stmt)
        watermark = marker_res.scalar_one_or_none()
        if watermark and watermark > 0:
            stmt = stmt.where(EventModel.id > watermark)

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


@router.delete("/scoped-clear")
async def clear_scoped_events(
    event_category: Optional[str] = Query(None, description="Scope by event category"),
    operating_system: Optional[str] = Query(None, description="Scope by operating system (windows/linux)"),
    hostname: Optional[str] = Query(None, description="Scope by hostname"),
    source_type: Optional[str] = Query(None, description="Scope by source type"),
    confirm: bool = Query(False, description="Must explicitly be true to confirm deletion"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst)
):
    """
    Safely delete persisted events within a strictly defined scope.
    Never deletes alerts, investigations, agents, or hosts.
    Requires Analyst or Admin role and explicit confirm=true flag.
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Set 'confirm=true' after user verification to execute scoped deletion."
        )

    # Require at least one scoping parameter to prevent accidental purge of entire database
    if not any([event_category, operating_system, hostname, source_type]):
        raise HTTPException(
            status_code=400,
            detail="At least one scoping parameter (category, operating_system, hostname, or source_type) is required."
        )

    del_stmt = delete(EventModel)
    scope_details = {}

    if event_category:
        del_stmt = del_stmt.where(EventModel.event_category == event_category)
        scope_details["event_category"] = event_category
    if operating_system:
        del_stmt = del_stmt.where(EventModel.operating_system.ilike(f"%{operating_system}%"))
        scope_details["operating_system"] = operating_system
    if hostname:
        del_stmt = del_stmt.where(EventModel.hostname.ilike(f"%{hostname}%"))
        scope_details["hostname"] = hostname
    if source_type:
        del_stmt = del_stmt.where(EventModel.source_type == source_type)
        scope_details["source_type"] = source_type

    res = await db.execute(del_stmt)
    await db.commit()

    deleted_count = res.rowcount or 0

    audit(
        "scoped_logs_deleted",
        actor=current_user.username,
        outcome="success",
        records_deleted=deleted_count,
        scope=scope_details
    )

    return {
        "status": "success",
        "message": f"Successfully deleted {deleted_count} scoped events.",
        "records_deleted": deleted_count,
        "scope": scope_details
    }


@router.post("/view-clear", response_model=ViewClearMarkerResponse)
async def clear_active_view(
    payload: ViewClearRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst)
):
    """
    Non-destructively clear the active view for a specific operating system and tab/category.
    Records a high-water mark (the current maximum Event.id) in `view_clear_marker`.
    Underlying events are NEVER deleted; they remain fully preserved in database and History tabs.
    """
    os_clean = payload.operating_system.strip().lower()
    cat_clean = payload.category.strip().lower()

    if not os_clean:
        raise HTTPException(status_code=400, detail="operating_system is required")
    if not cat_clean:
        raise HTTPException(status_code=400, detail="category is required")

    # Find the current maximum event id for this scope
    max_stmt = select(func.max(EventModel.id))
    if os_clean != "all":
        max_stmt = max_stmt.where(EventModel.operating_system.ilike(f"%{os_clean}%"))
    if cat_clean != "all" and cat_clean != "logs" and cat_clean != "live":
        max_stmt = max_stmt.where(EventModel.event_category.ilike(f"%{cat_clean}%"))

    max_res = await db.execute(max_stmt)
    current_max_id = max_res.scalar_one_or_none() or 0

    # Look for existing marker or create a new one
    marker_query = select(ViewClearMarker).where(
        ViewClearMarker.operating_system == os_clean,
        ViewClearMarker.category == cat_clean
    )
    res = await db.execute(marker_query)
    marker = res.scalars().first()

    if marker:
        marker.last_cleared_event_id = current_max_id
        marker.cleared_by = current_user.username
    else:
        marker = ViewClearMarker(
            operating_system=os_clean,
            category=cat_clean,
            last_cleared_event_id=current_max_id,
            cleared_by=current_user.username
        )
        db.add(marker)

    await db.commit()
    await db.refresh(marker)

    audit(
        "view_cleared",
        actor=current_user.username,
        outcome="success",
        operating_system=os_clean,
        category=cat_clean,
        watermark_event_id=current_max_id
    )

    return marker


@router.get("/view-clear-markers", response_model=list[ViewClearMarkerResponse])
async def list_view_clear_markers(
    operating_system: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Fetch active view clear markers.
    """
    stmt = select(ViewClearMarker)
    if operating_system:
        stmt = stmt.where(ViewClearMarker.operating_system.ilike(f"%{operating_system}%"))
    res = await db.execute(stmt)
    return res.scalars().all()

