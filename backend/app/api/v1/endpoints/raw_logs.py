from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from backend.app.db.session import get_db
from backend.app.models.raw_log import RawLog as RawLogModel
from backend.app.schemas.raw_log import RawLog
from backend.app.schemas.pagination import PaginatedResponse

router = APIRouter()

@router.get("/", response_model=PaginatedResponse[RawLog])
async def list_raw_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    agent_id: Optional[int] = None,
    source_type: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(RawLogModel)
    
    # Filtering
    if agent_id:
        stmt = stmt.where(RawLogModel.agent_id == agent_id)
    if source_type:
        stmt = stmt.where(RawLogModel.source_type == source_type)
    if start_time:
        stmt = stmt.where(RawLogModel.timestamp >= start_time)
    if end_time:
        if start_time and end_time < start_time:
            raise HTTPException(status_code=400, detail="end_time must be after start_time")
        stmt = stmt.where(RawLogModel.timestamp <= end_time)
        
    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()
    
    # Pagination & Sorting
    stmt = stmt.order_by(RawLogModel.timestamp.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/{id}", response_model=RawLog)
async def get_raw_log(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RawLogModel).where(RawLogModel.id == id))
    raw_log = result.scalars().first()
    if not raw_log:
        raise HTTPException(status_code=404, detail="Raw log not found")
    return raw_log
