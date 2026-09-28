from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional

from backend.app.db.session import get_db
from backend.app.models.analytics import BehaviorBaseline, BehaviorDeviation, BehaviorDeviationEvidence
from backend.app.schemas.analytics import BehaviorBaselineResponse, BehaviorDeviationResponse

router = APIRouter()

@router.get("/baselines", response_model=List[BehaviorBaselineResponse])
async def get_baselines(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BehaviorBaseline)
    if entity_type:
        stmt = stmt.where(BehaviorBaseline.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(BehaviorBaseline.entity_id == entity_id)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/baselines/{baseline_id}", response_model=BehaviorBaselineResponse)
async def get_baseline_by_id(
    baseline_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(BehaviorBaseline).where(BehaviorBaseline.id == baseline_id))
    baseline = result.scalars().first()
    if not baseline:
        raise HTTPException(status_code=404, detail="Baseline not found")
    return baseline

@router.get("/deviations", response_model=List[BehaviorDeviationResponse])
async def get_deviations(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    metric_name: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.orm import selectinload
    stmt = select(BehaviorDeviation).options(selectinload(BehaviorDeviation.evidence))
    
    if entity_type:
        stmt = stmt.where(BehaviorDeviation.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(BehaviorDeviation.entity_id == entity_id)
    if metric_name:
        stmt = stmt.where(BehaviorDeviation.metric_name == metric_name)
        
    stmt = stmt.order_by(BehaviorDeviation.observation_timestamp.desc()).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/entities/{entity_type}/{entity_id}/deviations", response_model=List[BehaviorDeviationResponse])
async def get_entity_deviations(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.orm import selectinload
    stmt = select(BehaviorDeviation).options(selectinload(BehaviorDeviation.evidence))\
        .where(BehaviorDeviation.entity_type == entity_type)\
        .where(BehaviorDeviation.entity_id == entity_id)\
        .order_by(BehaviorDeviation.observation_timestamp.desc())
    
    result = await db.execute(stmt)
    return result.scalars().all()

from backend.app.models.analytics import BehaviorCorrelation
from backend.app.schemas.analytics import BehaviorCorrelationResponse

@router.get("/correlations", response_model=List[BehaviorCorrelationResponse])
async def get_correlations(
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    relationship_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BehaviorCorrelation)
    if related_entity_type:
        stmt = stmt.where(BehaviorCorrelation.related_entity_type == related_entity_type)
    if related_entity_id:
        stmt = stmt.where(BehaviorCorrelation.related_entity_id == related_entity_id)
    if relationship_type:
        stmt = stmt.where(BehaviorCorrelation.relationship_type == relationship_type)
        
    stmt = stmt.order_by(BehaviorCorrelation.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/deviations/{deviation_id}/correlations", response_model=List[BehaviorCorrelationResponse])
async def get_deviation_correlations(
    deviation_id: int,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BehaviorCorrelation).where(BehaviorCorrelation.deviation_id == deviation_id).order_by(BehaviorCorrelation.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()

