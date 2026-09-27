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
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.event import Event as EventModel
from backend.app.models.raw_log import RawLog as RawLogModel
from backend.app.models.host import Host as HostModel
from backend.app.models.agent import Agent as AgentModel
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

@router.get("/{id}/context")
async def get_investigation_context(id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(InvestigationModel).options(selectinload(InvestigationModel.evidence)).where(InvestigationModel.id == id)
    result = await db.execute(stmt)
    inv = result.scalars().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    context: dict = {
        "alerts": [],
        "events": [],
        "raw_logs": [],
        "hosts": [],
        "agents": []
    }

    # Helper: find evidence_id for a given type+reference
    def _ev_id(ev_type: str, ref_id: str) -> int:
        for e in inv.evidence:
            if e.evidence_type == ev_type and e.reference_id == str(ref_id):
                return e.id
        return 0

    # Collect integer IDs per type (skip non-numeric reference_ids gracefully)
    def _ids(ev_type: str) -> list:
        return [int(e.reference_id) for e in inv.evidence if e.evidence_type == ev_type and e.reference_id.isdigit()]

    alert_ids = _ids("ALERT")
    event_ids = _ids("EVENT")
    raw_log_ids = _ids("RAW_LOG")
    host_ids = _ids("HOST")
    agent_ids = _ids("AGENT")

    # Fetch & serialize alerts
    if alert_ids:
        res = await db.execute(select(AlertModel).where(AlertModel.id.in_(alert_ids)))
        for a in res.scalars().all():
            context["alerts"].append({
                "evidence_id": _ev_id("ALERT", str(a.id)),
                "data": {
                    "id": a.id,
                    "alert_id": a.alert_id,
                    "title": a.title,
                    "description": a.description,
                    "severity": a.severity,
                    "status": a.status,
                    "first_seen": a.first_seen.isoformat() if a.first_seen else None,
                    "last_seen": a.last_seen.isoformat() if a.last_seen else None,
                    "occurrence_count": a.occurrence_count,
                    "rule_id": a.rule_id,
                    "agent_id": a.agent_id,
                    "host_id": a.host_id,
                    "metadata_": a.metadata_
                }
            })

    # Fetch & serialize events
    if event_ids:
        res = await db.execute(select(EventModel).where(EventModel.id.in_(event_ids)))
        for a in res.scalars().all():
            context["events"].append({
                "evidence_id": _ev_id("EVENT", str(a.id)),
                "data": {
                    "id": a.id,
                    "event_id": a.event_id,
                    "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                    "hostname": a.hostname,
                    "operating_system": a.operating_system,
                    "source_type": a.source_type,
                    "event_category": a.event_category,
                    "event_type": a.event_type,
                    "username": a.username,
                    "source_ip": a.source_ip,
                    "destination_ip": a.destination_ip,
                    "source_port": a.source_port,
                    "destination_port": a.destination_port,
                    "protocol": a.protocol,
                    "action": a.action,
                    "severity": a.severity,
                    "raw_log_id": a.raw_log_id,
                    "host_id": a.host_id,
                    "agent_id": a.agent_id,
                    "metadata_": a.metadata_
                }
            })

    # Fetch & serialize raw logs
    if raw_log_ids:
        res = await db.execute(select(RawLogModel).where(RawLogModel.id.in_(raw_log_ids)))
        for a in res.scalars().all():
            context["raw_logs"].append({
                "evidence_id": _ev_id("RAW_LOG", str(a.id)),
                "data": {
                    "id": a.id,
                    "event_identifier": a.event_identifier,
                    "source_type": a.source_type,
                    "source_name": a.source_name,
                    "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                    "received_at": a.received_at.isoformat() if a.received_at else None,
                    "raw_payload": a.raw_payload,
                    "host_id": a.host_id,
                    "agent_id": a.agent_id,
                    "ingestion_status": a.ingestion_status,
                    "metadata_": a.metadata_
                }
            })

    # Fetch & serialize hosts
    if host_ids:
        res = await db.execute(select(HostModel).where(HostModel.id.in_(host_ids)))
        for a in res.scalars().all():
            context["hosts"].append({
                "evidence_id": _ev_id("HOST", str(a.id)),
                "data": {
                    "id": a.id,
                    "host_identifier": a.host_identifier,
                    "hostname": a.hostname,
                    "operating_system": a.operating_system,
                    "os_version": a.os_version,
                    "ip_address": a.ip_address,
                    "status": a.status,
                    "last_seen": a.last_seen.isoformat() if a.last_seen else None,
                    "created_at": a.created_at.isoformat() if a.created_at else None
                }
            })

    # Fetch & serialize agents
    if agent_ids:
        res = await db.execute(select(AgentModel).where(AgentModel.id.in_(agent_ids)))
        for a in res.scalars().all():
            context["agents"].append({
                "evidence_id": _ev_id("AGENT", str(a.id)),
                "data": {
                    "id": a.id,
                    "agent_id": a.agent_id,
                    "hostname": a.hostname,
                    "operating_system": a.operating_system,
                    "agent_version": a.agent_version,
                    "status": a.status,
                    "last_seen": a.last_seen.isoformat() if a.last_seen else None,
                    "last_heartbeat": a.last_heartbeat.isoformat() if a.last_heartbeat else None,
                    "ip_address": a.ip_address,
                    "host_id": a.host_id
                }
            })

    return context


@router.delete("/{id}/evidence/{evidence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_evidence(id: int, evidence_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InvestigationEvidence).where(
        InvestigationEvidence.id == evidence_id,
        InvestigationEvidence.investigation_id == id
    ))
    ev = result.scalars().first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")

    await db.delete(ev)
    await db.commit()

    try:
        await publish_event("investigation_evidence_removed", {"id": id, "evidence_id": evidence_id})
    except Exception:
        pass
    return None
