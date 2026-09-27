from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime
import json

from backend.app.db.session import get_db
from backend.app.models.investigation import Investigation as InvestigationModel, InvestigationEvidence, InvestigationNote, InvestigationStatus, InvestigationSeverity
from backend.app.schemas.investigation import (
    Investigation, InvestigationCreate, InvestigationUpdate, InvestigationStatusUpdate,
    InvestigationEvidence as EvidenceSchema, InvestigationEvidenceCreate,
    InvestigationNote as NoteSchema, InvestigationNoteCreate, InvestigationSummary
)
from backend.app.schemas.pagination import PaginatedResponse
# Assuming a real-time event publisher exists, we'll try to use it if available
try:
    from backend.app.api.v1.endpoints.websockets import manager
    async def publish_event(event_type: str, data: dict):
        # Fire and forget if manager has active connections
        # But wait, manager sends "new_event" for raw events usually
        # We can send custom events
        message = json.dumps({"type": event_type, "data": data}, default=str)
        for connection in manager.active_connections:
            await connection.send_text(message)
except ImportError:
    async def publish_event(event_type: str, data: dict):
        pass

router = APIRouter()

@router.post("/", response_model=Investigation, status_code=status.HTTP_201_CREATED)
async def create_investigation(
    inv_in: InvestigationCreate,
    db: AsyncSession = Depends(get_db)
):
    db_obj = InvestigationModel(
        title=inv_in.title,
        description=inv_in.description,
        status=inv_in.status.value,
        severity=inv_in.severity.value,
        assigned_to=inv_in.assigned_to
    )
    db.add(db_obj)
    await db.flush()

    if inv_in.evidence:
        for ev in inv_in.evidence:
            db_ev = InvestigationEvidence(
                investigation_id=db_obj.id,
                evidence_type=ev.evidence_type.value,
                reference_id=ev.reference_id,
                added_by=ev.added_by,
                description=ev.description
            )
            db.add(db_ev)

    await db.commit()
    await db.refresh(db_obj)

    # Reload with relations
    stmt = select(InvestigationModel).options(
        selectinload(InvestigationModel.evidence),
        selectinload(InvestigationModel.notes)
    ).where(InvestigationModel.id == db_obj.id)
    result = await db.execute(stmt)
    full_inv = result.scalar_one()

    # Try to publish
    try:
        await publish_event("investigation_created", {"id": full_inv.id, "title": full_inv.title})
    except Exception:
        pass

    return full_inv

@router.get("/", response_model=PaginatedResponse[InvestigationSummary])
async def list_investigations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: Optional[InvestigationStatus] = None,
    severity: Optional[InvestigationSeverity] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(InvestigationModel)

    if status:
        stmt = stmt.where(InvestigationModel.status == status.value)
    if severity:
        stmt = stmt.where(InvestigationModel.severity == severity.value)
    if assigned_to:
        stmt = stmt.where(InvestigationModel.assigned_to == assigned_to)
    if search:
        stmt = stmt.where(or_(
            InvestigationModel.title.ilike(f"%{search}%"),
            InvestigationModel.description.ilike(f"%{search}%"),
            InvestigationModel.resolution.ilike(f"%{search}%")
        ))

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(InvestigationModel.updated_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    stmt = stmt.options(selectinload(InvestigationModel.evidence))

    result = await db.execute(stmt)
    items = result.scalars().all()

    # Convert to summary
    summaries = []
    for item in items:
        # Just setting evidence_count based on loaded evidence
        setattr(item, 'evidence_count', len(item.evidence) if item.evidence else 0)
        summaries.append(item)

    return PaginatedResponse(
        items=summaries,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/{id}", response_model=Investigation)
async def get_investigation(id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(InvestigationModel).options(
        selectinload(InvestigationModel.evidence),
        selectinload(InvestigationModel.notes)
    ).where(InvestigationModel.id == id)
    result = await db.execute(stmt)
    inv = result.scalars().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return inv

@router.patch("/{id}", response_model=Investigation)
async def update_investigation(id: int, inv_in: InvestigationUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(InvestigationModel).options(
        selectinload(InvestigationModel.evidence),
        selectinload(InvestigationModel.notes)
    ).where(InvestigationModel.id == id)
    result = await db.execute(stmt)
    inv = result.scalars().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    update_data = inv_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        if field in ['status', 'severity'] and value is not None:
            setattr(inv, field, value.value)
        else:
            setattr(inv, field, value)

    await db.commit()
    await db.refresh(inv)

    try:
        await publish_event("investigation_updated", {"id": inv.id})
    except Exception:
        pass

    return inv

@router.post("/{id}/status", response_model=Investigation)
async def update_status(id: int, status_in: InvestigationStatusUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(InvestigationModel).options(
        selectinload(InvestigationModel.evidence),
        selectinload(InvestigationModel.notes)
    ).where(InvestigationModel.id == id)
    result = await db.execute(stmt)
    inv = result.scalars().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    inv.status = status_in.status.value
    if status_in.resolution is not None:
        inv.resolution = status_in.resolution

    await db.commit()
    await db.refresh(inv)

    try:
        await publish_event("investigation_status_changed", {"id": inv.id, "status": inv.status})
    except Exception:
        pass

    return inv

@router.post("/{id}/evidence", response_model=EvidenceSchema, status_code=status.HTTP_201_CREATED)
async def add_evidence(id: int, evidence_in: InvestigationEvidenceCreate, db: AsyncSession = Depends(get_db)):
    # Check if investigation exists
    result = await db.execute(select(InvestigationModel).where(InvestigationModel.id == id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Investigation not found")

    # Check for duplicate
    dup_stmt = select(InvestigationEvidence).where(
        InvestigationEvidence.investigation_id == id,
        InvestigationEvidence.evidence_type == evidence_in.evidence_type.value,
        InvestigationEvidence.reference_id == evidence_in.reference_id
    )
    dup_res = await db.execute(dup_stmt)
    dup_row = dup_res.scalars().first()
    if dup_row:
        return dup_row

    db_ev = InvestigationEvidence(
        investigation_id=id,
        evidence_type=evidence_in.evidence_type.value,
        reference_id=evidence_in.reference_id,
        added_by=evidence_in.added_by,
        description=evidence_in.description
    )
    db.add(db_ev)
    await db.commit()
    await db.refresh(db_ev)

    try:
        await publish_event("investigation_evidence_added", {"id": id})
    except Exception:
        pass

    return db_ev

@router.post("/{id}/notes", response_model=NoteSchema, status_code=status.HTTP_201_CREATED)
async def add_note(id: int, note_in: InvestigationNoteCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InvestigationModel).where(InvestigationModel.id == id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Investigation not found")

    db_note = InvestigationNote(
        investigation_id=id,
        content=note_in.content,
        author=note_in.author
    )
    db.add(db_note)
    await db.commit()
    await db.refresh(db_note)

    try:
        await publish_event("investigation_note_added", {"id": id})
    except Exception:
        pass

    return db_note
