from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional

from backend.app.db.session import get_db
from backend.app.models.detection import DetectionRule as RuleModel, DetectionResult as ResultModel
from backend.app.schemas.detection import DetectionRule, DetectionResult
from backend.app.schemas.pagination import PaginatedResponse

router = APIRouter()

@router.get("/rules", response_model=PaginatedResponse[DetectionRule])
async def list_rules(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    enabled: Optional[bool] = None,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(RuleModel)
    
    if enabled is not None:
        stmt = stmt.where(RuleModel.enabled == enabled)
    if severity:
        stmt = stmt.where(RuleModel.severity == severity)
        
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()
    
    stmt = stmt.order_by(RuleModel.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/rules/{id}", response_model=DetectionRule)
async def get_rule(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RuleModel).where(RuleModel.id == id))
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule

@router.get("/results", response_model=PaginatedResponse[DetectionResult])
async def list_results(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    rule_id: Optional[int] = None,
    event_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ResultModel)
    
    if rule_id:
        stmt = stmt.where(ResultModel.rule_id == rule_id)
    if event_id:
        stmt = stmt.where(ResultModel.event_id == event_id)
        
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()
    
    stmt = stmt.order_by(ResultModel.timestamp.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/results/{id}", response_model=DetectionResult)
async def get_result(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResultModel).where(ResultModel.id == id))
    det_result = result.scalars().first()
    if not det_result:
        raise HTTPException(status_code=404, detail="Detection result not found")
    return det_result
