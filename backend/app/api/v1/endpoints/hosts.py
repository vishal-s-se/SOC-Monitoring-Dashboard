from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional

from backend.app.db.session import get_db
from backend.app.models.host import Host as HostModel
from backend.app.schemas.host import Host
from backend.app.schemas.pagination import PaginatedResponse

router = APIRouter()

@router.get("/", response_model=PaginatedResponse[Host])
async def list_hosts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    operating_system: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(HostModel)

    if operating_system:
        stmt = stmt.where(HostModel.operating_system == operating_system)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(HostModel.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    items = result.scalars().all()

    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/{id}", response_model=Host)
async def get_host(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(HostModel).where(HostModel.id == id))
    host = result.scalars().first()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    return host
