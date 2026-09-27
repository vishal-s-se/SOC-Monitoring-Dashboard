from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from backend.app.db.session import get_db
from backend.app.models.alert import Alert as AlertModel
from backend.app.schemas.alert import Alert
from backend.app.schemas.pagination import PaginatedResponse
from backend.app.engine.alerter import AlertService

router = APIRouter()

@router.get("/", response_model=PaginatedResponse[Alert])
async def list_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    severity: Optional[str] = None,
    agent_id: Optional[int] = None,
    rule_id: Optional[int] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AlertModel)

    if status:
        stmt = stmt.where(AlertModel.status == status)
    if severity:
        stmt = stmt.where(AlertModel.severity == severity)
    if agent_id:
        stmt = stmt.where(AlertModel.agent_id == agent_id)
    if rule_id:
        stmt = stmt.where(AlertModel.rule_id == rule_id)
    if start_time:
        stmt = stmt.where(AlertModel.last_seen >= start_time)
    if end_time:
        if start_time and end_time < start_time:
            raise HTTPException(status_code=400, detail="end_time must be after start_time")
        stmt = stmt.where(AlertModel.last_seen <= end_time)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(AlertModel.last_seen.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    items = result.scalars().all()

    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/{alert_id}", response_model=Alert)
async def retrieve_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(AlertModel).where(AlertModel.alert_id == alert_id)
    result = await db.execute(stmt)
    alert = result.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert

@router.post("/{alert_id}/acknowledge", response_model=Alert)
async def acknowledge_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await AlertService.acknowledge_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found or invalid transition")
    await db.commit()
    await db.refresh(alert)
    return alert

@router.post("/{alert_id}/resolve", response_model=Alert)
async def resolve_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await AlertService.resolve_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found or invalid transition")
    await db.commit()
    await db.refresh(alert)
    return alert
