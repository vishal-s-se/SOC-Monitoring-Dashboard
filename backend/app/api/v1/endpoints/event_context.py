from datetime import datetime, timedelta
from typing import Optional, List, Set
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import selectinload

from backend.app.db.session import get_db
from backend.app.models.event import Event as EventModel
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.detection import DetectionResult
from backend.app.models.investigation import Investigation as InvestigationModel, InvestigationEvidence
from backend.app.models.host import Host as HostModel
from backend.app.models.agent import Agent as AgentModel
from backend.app.models.mitre import (
    MitreMapping as MitreMappingModel,
    MitreTechnique as MitreTechniqueModel,
    MitreTechniqueTactic as MitreTechniqueTacticModel
)
from backend.app.schemas.event_context import (
    EventContext,
    EventContextHost,
    EventContextAgent,
    EventContextAlert,
    EventContextInvestigation,
    EventContextMitreTechnique,
    EventContextNearbyEvent
)

router = APIRouter()


@router.get("/{event_id}/context", response_model=EventContext)
async def get_event_context(
    event_id: str,
    nearby_window_minutes: int = Query(15, ge=1, le=120),
    db: AsyncSession = Depends(get_db)
):
    raw = event_id.strip()

    stmt = select(EventModel)
    if raw.isdigit():
        stmt = stmt.where(EventModel.id == int(raw))
    else:
        stmt = stmt.where(EventModel.event_id == raw)

    res = await db.execute(stmt)
    event = res.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail=f"Event '{raw}' not found")

    # 1. Host context
    host_ctx: Optional[EventContextHost] = None
    if event.host_id:
        h_res = await db.execute(select(HostModel).where(HostModel.id == event.host_id))
        host_obj = h_res.scalars().first()
        if host_obj:
            host_ctx = EventContextHost.model_validate(host_obj)

    # 2. Agent context
    agent_ctx: Optional[EventContextAgent] = None
    if event.agent_id:
        ag_res = await db.execute(select(AgentModel).where(AgentModel.id == event.agent_id))
        ag_obj = ag_res.scalars().first()
        if ag_obj:
            agent_ctx = EventContextAgent.model_validate(ag_obj)

    # 3. Associated Alerts (via detection results for this event)
    al_subq = select(DetectionResult.alert_id).where(
        DetectionResult.event_id == event.id,
        DetectionResult.alert_id.isnot(None)
    ).distinct()
    al_id_res = await db.execute(al_subq)
    alert_ids = list(al_id_res.scalars().all())

    alerts_ctx: List[EventContextAlert] = []
    if alert_ids:
        al_q = select(AlertModel).options(selectinload(AlertModel.rule)).where(AlertModel.id.in_(alert_ids)).order_by(AlertModel.last_seen.desc())
        al_res = await db.execute(al_q)
        for al in al_res.scalars().all():
            alerts_ctx.append(EventContextAlert(
                id=al.id,
                alert_id=al.alert_id,
                title=al.title,
                severity=al.severity,
                status=al.status,
                first_seen=al.first_seen,
                last_seen=al.last_seen,
                occurrence_count=al.occurrence_count,
                rule_id=al.rule_id,
                rule_name=al.rule.name if al.rule else None
            ))

    # 4. Associated Investigations (via this event's id or its alerts)
    event_ref_str = str(event.id)
    alert_ref_strs = [str(aid) for aid in alert_ids]

    inv_conditions = [
        and_(InvestigationEvidence.evidence_type == "EVENT", InvestigationEvidence.reference_id == event_ref_str)
    ]
    if alert_ref_strs:
        inv_conditions.append(
            and_(InvestigationEvidence.evidence_type == "ALERT", InvestigationEvidence.reference_id.in_(alert_ref_strs))
        )

    inv_ev_q = select(InvestigationEvidence.investigation_id).where(or_(*inv_conditions)).distinct()
    inv_ev_res = await db.execute(inv_ev_q)
    inv_ids = list(inv_ev_res.scalars().all())

    investigations_ctx: List[EventContextInvestigation] = []
    if inv_ids:
        inv_q = select(InvestigationModel).where(InvestigationModel.id.in_(inv_ids)).order_by(InvestigationModel.updated_at.desc())
        inv_res = await db.execute(inv_q)
        for inv in inv_res.scalars().all():
            investigations_ctx.append(EventContextInvestigation(
                id=inv.id,
                title=inv.title,
                status=inv.status,
                severity=inv.severity,
                created_at=inv.created_at,
                updated_at=inv.updated_at
            ))

    # 5. Explicit MITRE mappings for this event
    mitre_ctx: List[EventContextMitreTechnique] = []
    seen_tech_ids: Set[str] = set()

    ev_mitre_q = (
        select(MitreMappingModel, MitreTechniqueModel)
        .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
        .options(selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic))
        .where(
            MitreMappingModel.target_type == "EVENT",
            MitreMappingModel.target_id == event_ref_str
        )
    )
    ev_mitre_res = await db.execute(ev_mitre_q)
    for m, t in ev_mitre_res.all():
        if t.technique_id not in seen_tech_ids:
            tactics = [{"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name} for tt in t.tactics if tt.tactic]
            mitre_ctx.append(EventContextMitreTechnique(
                technique_id=t.technique_id, name=t.name, tactics=tactics,
                is_subtechnique=t.is_subtechnique, parent_technique_id=t.parent_technique_id,
                source=m.mapping_source, confidence=m.confidence,
                evidence_reference=m.evidence_reference
            ))
            seen_tech_ids.add(t.technique_id)

    # 6. Nearby events (same host ± window, excluding this event)
    nearby_events_ctx: List[EventContextNearbyEvent] = []
    if event.timestamp and (event.hostname or event.host_id):
        window_start = event.timestamp - timedelta(minutes=nearby_window_minutes)
        window_end = event.timestamp + timedelta(minutes=nearby_window_minutes)
        nearby_filter = and_(
            EventModel.timestamp >= window_start,
            EventModel.timestamp <= window_end,
            EventModel.id != event.id
        )
        host_match = []
        if event.hostname:
            host_match.append(EventModel.hostname == event.hostname)
        if event.host_id:
            host_match.append(EventModel.host_id == event.host_id)

        nearby_q = select(EventModel).where(
            nearby_filter,
            or_(*host_match) if host_match else EventModel.id == -1
        ).order_by(EventModel.timestamp.desc()).limit(20)
        nearby_res = await db.execute(nearby_q)
        for nev in nearby_res.scalars().all():
            nearby_events_ctx.append(EventContextNearbyEvent(
                id=nev.id,
                event_id=nev.event_id,
                timestamp=nev.timestamp,
                event_type=nev.event_type,
                event_category=nev.event_category,
                severity=nev.severity,
                username=nev.username,
                source_ip=nev.source_ip,
                destination_ip=nev.destination_ip,
                action=nev.action
            ))

    return EventContext(
        event_id=event.event_id,
        id=event.id,
        timestamp=event.timestamp,
        hostname=event.hostname,
        username=event.username,
        source_ip=event.source_ip,
        destination_ip=event.destination_ip,
        event_type=event.event_type,
        event_category=event.event_category,
        severity=event.severity,
        action=event.action,
        host=host_ctx,
        agent=agent_ctx,
        alerts=alerts_ctx,
        investigations=investigations_ctx,
        mitre_techniques=mitre_ctx,
        nearby_events=nearby_events_ctx,
        raw_log_id=event.raw_log_id
    )
