from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional

from backend.app.db.session import get_db
from backend.app.models.agent import Agent as AgentModel
from backend.app.schemas.agent import Agent
from backend.app.schemas.pagination import PaginatedResponse

router = APIRouter()

@router.get("/", response_model=PaginatedResponse[Agent])
async def list_agents(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    operating_system: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AgentModel)
    
    if status:
        stmt = stmt.where(AgentModel.status == status)
    if operating_system:
        stmt = stmt.where(AgentModel.operating_system == operating_system)
        
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()
    
    stmt = stmt.order_by(AgentModel.registered_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/{id}", response_model=Agent)
async def get_agent(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AgentModel).where(AgentModel.id == id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent
