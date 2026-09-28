from datetime import datetime
from typing import Optional, List, Set, Dict
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import selectinload

from backend.app.db.session import get_db
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.event import Event as EventModel
from backend.app.models.detection import DetectionResult, DetectionRule as DetectionRuleModel
from backend.app.models.investigation import Investigation as InvestigationModel, InvestigationEvidence
from backend.app.models.host import Host as HostModel
from backend.app.models.agent import Agent as AgentModel
from backend.app.models.mitre import (
    MitreMapping as MitreMappingModel,
    MitreTechnique as MitreTechniqueModel,
    MitreTechniqueTactic as MitreTechniqueTacticModel
)
from backend.app.schemas.alert_context import (
    AlertContext,
    AlertContextRule,
    AlertContextHost,
    AlertContextAgent,
    AlertContextEvent,
    AlertContextInvestigation,
    AlertContextMitreTechnique,
    AlertContextIp
)

router = APIRouter()


@router.get("/{alert_id}/context", response_model=AlertContext)
async def get_alert_context(
    alert_id: str,
    db: AsyncSession = Depends(get_db)
):
    raw = alert_id.strip()

    stmt = select(AlertModel).options(
        selectinload(AlertModel.rule),
        selectinload(AlertModel.host),
        selectinload(AlertModel.agent)
    )
    if raw.isdigit():
        stmt = stmt.where(AlertModel.id == int(raw))
    else:
        stmt = stmt.where(AlertModel.alert_id == raw)

    res = await db.execute(stmt)
    alert = res.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert '{raw}' not found")

    # 1. Rule
    rule_ctx: Optional[AlertContextRule] = None
    if alert.rule:
        rule_ctx = AlertContextRule(
            id=alert.rule.id,
            rule_id=alert.rule.rule_id,
            name=alert.rule.name,
            description=alert.rule.description,
            severity=alert.rule.severity
        )

    # 2. Host
    host_ctx: Optional[AlertContextHost] = None
    if alert.host:
        host_ctx = AlertContextHost(
            id=alert.host.id,
            hostname=alert.host.hostname,
            operating_system=alert.host.operating_system,
            ip_address=alert.host.ip_address,
            status=alert.host.status,
            last_seen=alert.host.last_seen
        )

    # 3. Agent
    agent_ctx: Optional[AlertContextAgent] = None
    if alert.agent:
        agent_ctx = AlertContextAgent(
            id=alert.agent.id,
            agent_id=alert.agent.agent_id,
            hostname=alert.agent.hostname,
            status=alert.agent.status,
            last_seen=alert.agent.last_seen
        )

    # 4. Triggering Events (via detection results)
    dr_q = select(DetectionResult.event_id).where(
        DetectionResult.alert_id == alert.id,
        DetectionResult.event_id.isnot(None)
    ).distinct().limit(50)
    dr_res = await db.execute(dr_q)
    event_ids = list(dr_res.scalars().all())

    triggering_events: List[AlertContextEvent] = []
    observed_ips: List[AlertContextIp] = []
    ip_count_map: Dict[str, Dict[str, int]] = {}

    if event_ids:
        ev_q = select(EventModel).where(EventModel.id.in_(event_ids)).order_by(EventModel.timestamp.desc())
        ev_res = await db.execute(ev_q)
        for ev in ev_res.scalars().all():
            triggering_events.append(AlertContextEvent(
                id=ev.id,
                event_id=ev.event_id,
                timestamp=ev.timestamp,
                event_type=ev.event_type,
                event_category=ev.event_category,
                severity=ev.severity,
                username=ev.username,
                source_ip=ev.source_ip,
                destination_ip=ev.destination_ip,
                action=ev.action
            ))
            if ev.source_ip:
                key = (ev.source_ip, "source")
                ip_count_map.setdefault(f"{ev.source_ip}|source", {"ip": ev.source_ip, "role": "source", "count": 0})
                ip_count_map[f"{ev.source_ip}|source"]["count"] += 1
            if ev.destination_ip:
                ip_count_map.setdefault(f"{ev.destination_ip}|destination", {"ip": ev.destination_ip, "role": "destination", "count": 0})
                ip_count_map[f"{ev.destination_ip}|destination"]["count"] += 1

    for entry in ip_count_map.values():
        observed_ips.append(AlertContextIp(ip_address=entry["ip"], role=entry["role"], event_count=entry["count"]))

    # 5. Associated Investigations
    alert_ref_str = str(alert.id)
    inv_q = select(InvestigationEvidence.investigation_id).where(
        InvestigationEvidence.evidence_type == "ALERT",
        InvestigationEvidence.reference_id == alert_ref_str
    ).distinct()
    inv_ev_res = await db.execute(inv_q)
    inv_ids = list(inv_ev_res.scalars().all())

    investigations_ctx: List[AlertContextInvestigation] = []
    if inv_ids:
        inv_objs_q = select(InvestigationModel).where(InvestigationModel.id.in_(inv_ids)).order_by(InvestigationModel.updated_at.desc())
        inv_objs_res = await db.execute(inv_objs_q)
        for inv in inv_objs_res.scalars().all():
            investigations_ctx.append(AlertContextInvestigation(
                id=inv.id,
                title=inv.title,
                status=inv.status,
                severity=inv.severity,
                created_at=inv.created_at,
                updated_at=inv.updated_at
            ))

    # 6. MITRE ATT&CK mappings (alert level + rule level)
    mitre_ctx: List[AlertContextMitreTechnique] = []
    seen_tech_ids: Set[str] = set()

    al_mitre_q = (
        select(MitreMappingModel, MitreTechniqueModel)
        .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
        .options(selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic))
        .where(
            MitreMappingModel.target_type == "ALERT",
            MitreMappingModel.target_id == alert_ref_str
        )
    )
    al_mitre_res = await db.execute(al_mitre_q)
    for m, t in al_mitre_res.all():
        if t.technique_id not in seen_tech_ids:
            tactics = [{"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name} for tt in t.tactics if tt.tactic]
            mitre_ctx.append(AlertContextMitreTechnique(
                technique_id=t.technique_id, name=t.name, tactics=tactics,
                is_subtechnique=t.is_subtechnique, parent_technique_id=t.parent_technique_id,
                source=m.mapping_source, confidence=m.confidence,
                relationship="Alert Direct Mapping",
                evidence_reference=m.evidence_reference
            ))
            seen_tech_ids.add(t.technique_id)

    if alert.rule_id:
        rule_mitre_q = (
            select(MitreMappingModel, MitreTechniqueModel)
            .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
            .options(selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic))
            .where(
                MitreMappingModel.target_type == "DETECTION_RULE",
                MitreMappingModel.target_id == str(alert.rule_id)
            )
        )
        rule_mitre_res = await db.execute(rule_mitre_q)
        for m, t in rule_mitre_res.all():
            if t.technique_id not in seen_tech_ids:
                tactics = [{"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name} for tt in t.tactics if tt.tactic]
                mitre_ctx.append(AlertContextMitreTechnique(
                    technique_id=t.technique_id, name=t.name, tactics=tactics,
                    is_subtechnique=t.is_subtechnique, parent_technique_id=t.parent_technique_id,
                    source=m.mapping_source, confidence=m.confidence,
                    relationship="Detection Rule Mapping",
                    evidence_reference=m.evidence_reference or f"Rule #{alert.rule_id}"
                ))
                seen_tech_ids.add(t.technique_id)

    return AlertContext(
        id=alert.id,
        alert_id=alert.alert_id,
        title=alert.title,
        severity=alert.severity,
        status=alert.status,
        first_seen=alert.first_seen,
        last_seen=alert.last_seen,
        occurrence_count=alert.occurrence_count,
        rule=rule_ctx,
        host=host_ctx,
        agent=agent_ctx,
        triggering_events=triggering_events,
        observed_ips=observed_ips,
        investigations=investigations_ctx,
        mitre_techniques=mitre_ctx
    )
