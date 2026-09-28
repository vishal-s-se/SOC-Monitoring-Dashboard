from datetime import datetime
from typing import Optional, List, Dict, Set, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import selectinload

from backend.app.db.session import get_db
from backend.app.models.investigation import Investigation as InvestigationModel, InvestigationEvidence
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.event import Event as EventModel
from backend.app.models.raw_log import RawLog as RawLogModel
from backend.app.models.host import Host as HostModel
from backend.app.models.agent import Agent as AgentModel
from backend.app.models.detection import DetectionResult, DetectionRule as DetectionRuleModel
from backend.app.models.mitre import (
    MitreMapping as MitreMappingModel,
    MitreTechnique as MitreTechniqueModel,
    MitreTechniqueTactic as MitreTechniqueTacticModel
)
from backend.app.schemas.investigation_intelligence import (
    InvestigationIntelligenceOverview,
    IntelSummary,
    IntelEntityHost,
    IntelEntityIp,
    IntelEntityUser,
    IntelAlert,
    IntelDetectionRule,
    IntelMitreMapping,
    IntelTimelineSummary,
    IntelEvent,
    IntelHistoricalContext,
    IntelRelatedInvestigation
)

router = APIRouter()

@router.get("/{investigation_id}/intelligence", response_model=InvestigationIntelligenceOverview)
async def get_investigation_intelligence(
    investigation_id: int,
    db: AsyncSession = Depends(get_db)
):
    # 1. Base Investigation
    inv_stmt = select(InvestigationModel).where(InvestigationModel.id == investigation_id)
    inv_res = await db.execute(inv_stmt)
    inv = inv_res.scalars().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    # 2. Get Evidence
    ev_stmt = select(InvestigationEvidence).where(InvestigationEvidence.investigation_id == investigation_id)
    ev_res = await db.execute(ev_stmt)
    evidences = ev_res.scalars().all()

    total_evidence_count = len(evidences)
    
    direct_event_ids: Set[int] = set()
    direct_alert_ids: Set[int] = set()
    direct_raw_log_ids: Set[int] = set()
    direct_host_ids: Set[int] = set()
    direct_agent_ids: Set[int] = set()

    for e in evidences:
        if e.evidence_type == "EVENT" and e.reference_id.isdigit():
            direct_event_ids.add(int(e.reference_id))
        elif e.evidence_type == "ALERT" and e.reference_id.isdigit():
            direct_alert_ids.add(int(e.reference_id))
        elif e.evidence_type == "RAW_LOG" and e.reference_id.isdigit():
            direct_raw_log_ids.add(int(e.reference_id))
        elif e.evidence_type == "HOST" and e.reference_id.isdigit():
            direct_host_ids.add(int(e.reference_id))
        elif e.evidence_type == "AGENT" and e.reference_id.isdigit():
            direct_agent_ids.add(int(e.reference_id))

    # 3. Resolve alerts and their triggering events
    triggering_event_ids: Set[int] = set()
    alert_objs = []
    
    if direct_alert_ids:
        al_stmt = select(AlertModel).options(
            selectinload(AlertModel.rule)
        ).where(AlertModel.id.in_(list(direct_alert_ids)))
        al_res = await db.execute(al_stmt)
        alert_objs = al_res.scalars().all()

        dr_stmt = select(DetectionResult.event_id).where(
            DetectionResult.alert_id.in_(list(direct_alert_ids)),
            DetectionResult.event_id.isnot(None)
        )
        dr_res = await db.execute(dr_stmt)
        for ev_id in dr_res.scalars().all():
            triggering_event_ids.add(ev_id)

    all_target_event_ids = direct_event_ids.union(triggering_event_ids)
    
    # 4. Fetch Events
    event_objs = []
    if all_target_event_ids:
        ev_stmt = select(EventModel).where(EventModel.id.in_(list(all_target_event_ids)))
        ev_res = await db.execute(ev_stmt)
        event_objs = ev_res.scalars().all()

    # 5. Build entities & timeline
    intel_events: List[IntelEvent] = []
    
    host_map: Dict[str, Dict[str, Any]] = {}  # key: hostname or host_id str
    ip_map: Dict[str, Dict[str, Any]] = {}    # key: ip
    user_map: Dict[str, Dict[str, Any]] = {}  # key: username
    
    first_ev_time = None
    last_ev_time = None
    
    for ev in event_objs:
        is_direct = ev.id in direct_event_ids
        reason = "Direct Evidence" if is_direct else "Triggered Alert Evidence"
        
        intel_events.append(IntelEvent(
            id=ev.id,
            event_id=ev.event_id,
            timestamp=ev.timestamp,
            event_type=ev.event_type,
            event_category=ev.event_category,
            severity=ev.severity,
            hostname=ev.hostname,
            username=ev.username,
            source_ip=ev.source_ip,
            destination_ip=ev.destination_ip,
            is_direct=is_direct,
            correlation_reason=reason,
            provenance="EVENT" if is_direct else "ALERT"
        ))

        # Time bounds
        if not first_ev_time or ev.timestamp < first_ev_time:
            first_ev_time = ev.timestamp
        if not last_ev_time or ev.timestamp > last_ev_time:
            last_ev_time = ev.timestamp

        # Host
        if ev.hostname or ev.host_id:
            h_key = ev.hostname or str(ev.host_id)
            if h_key not in host_map:
                host_map[h_key] = {"hostname": h_key, "host_id": ev.host_id, "os": ev.operating_system, "agent": ev.agent_id, "ev_count": 0, "first": ev.timestamp, "last": ev.timestamp}
            host_map[h_key]["ev_count"] += 1
            if ev.timestamp < host_map[h_key]["first"]: host_map[h_key]["first"] = ev.timestamp
            if ev.timestamp > host_map[h_key]["last"]: host_map[h_key]["last"] = ev.timestamp

        # IPs
        if ev.source_ip:
            if ev.source_ip not in ip_map:
                ip_map[ev.source_ip] = {"ip": ev.source_ip, "roles": set(), "ev_count": 0, "first": ev.timestamp, "last": ev.timestamp}
            ip_map[ev.source_ip]["roles"].add("source")
            ip_map[ev.source_ip]["ev_count"] += 1
            if ev.timestamp < ip_map[ev.source_ip]["first"]: ip_map[ev.source_ip]["first"] = ev.timestamp
            if ev.timestamp > ip_map[ev.source_ip]["last"]: ip_map[ev.source_ip]["last"] = ev.timestamp

        if ev.destination_ip:
            if ev.destination_ip not in ip_map:
                ip_map[ev.destination_ip] = {"ip": ev.destination_ip, "roles": set(), "ev_count": 0, "first": ev.timestamp, "last": ev.timestamp}
            ip_map[ev.destination_ip]["roles"].add("destination")
            ip_map[ev.destination_ip]["ev_count"] += 1
            if ev.timestamp < ip_map[ev.destination_ip]["first"]: ip_map[ev.destination_ip]["first"] = ev.timestamp
            if ev.timestamp > ip_map[ev.destination_ip]["last"]: ip_map[ev.destination_ip]["last"] = ev.timestamp

        # Users
        if ev.username:
            u_key = ev.username
            if u_key not in user_map:
                user_map[u_key] = {"user": u_key, "hosts": set(), "ips": set(), "ev_count": 0, "first": ev.timestamp, "last": ev.timestamp}
            user_map[u_key]["ev_count"] += 1
            if ev.hostname: user_map[u_key]["hosts"].add(ev.hostname)
            if ev.source_ip: user_map[u_key]["ips"].add(ev.source_ip)
            if ev.timestamp < user_map[u_key]["first"]: user_map[u_key]["first"] = ev.timestamp
            if ev.timestamp > user_map[u_key]["last"]: user_map[u_key]["last"] = ev.timestamp

    # Process Alerts
    intel_alerts: List[IntelAlert] = []
    rule_map: Dict[int, Dict[str, Any]] = {}

    for al in alert_objs:
        intel_alerts.append(IntelAlert(
            id=al.id,
            alert_id=al.alert_id,
            title=al.title,
            severity=al.severity,
            status=al.status,
            timestamp=al.first_seen,
            rule_name=al.rule.name if al.rule else None,
            mitre_mappings=[],
            evidence_count=al.occurrence_count
        ))
        
        if al.rule:
            if al.rule.id not in rule_map:
                rule_map[al.rule.id] = {
                    "id": al.rule.id,
                    "rule_id": al.rule.rule_id,
                    "name": al.rule.name,
                    "severity": al.rule.severity,
                    "type": "Signature",
                    "mitre": [],
                    "alerts": 0,
                    "ev_count": 0
                }
            rule_map[al.rule.id]["alerts"] += 1

    # 6. Fetch MITRE
    mitre_targets = []
    if direct_event_ids: mitre_targets.append(and_(MitreMappingModel.target_type == "EVENT", MitreMappingModel.target_id.in_([str(eid) for eid in direct_event_ids])))
    if direct_alert_ids: mitre_targets.append(and_(MitreMappingModel.target_type == "ALERT", MitreMappingModel.target_id.in_([str(aid) for aid in direct_alert_ids])))
    if rule_map.keys(): mitre_targets.append(and_(MitreMappingModel.target_type == "DETECTION_RULE", MitreMappingModel.target_id.in_([str(rid) for rid in rule_map.keys()])))
    # Add direct mapping on the investigation itself (as a container of evidence) if that were supported, but we only have evidence-level mappings.

    intel_mitre: List[IntelMitreMapping] = []
    if mitre_targets:
        mitre_stmt = (
            select(MitreMappingModel, MitreTechniqueModel)
            .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
            .options(selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic))
            .where(or_(*mitre_targets))
        )
        mitre_res = await db.execute(mitre_stmt)
        seen_tech = set()
        for m, t in mitre_res.all():
            tactics = [tt.tactic.name for tt in t.tactics if tt.tactic]
            prov = "Event Mapping" if m.target_type == "EVENT" else ("Alert Mapping" if m.target_type == "ALERT" else "Detection Rule Mapping")
            intel_mitre.append(IntelMitreMapping(
                technique_id=t.technique_id,
                technique_name=t.name,
                tactics=tactics,
                is_subtechnique=t.is_subtechnique,
                mapping_source=m.mapping_source,
                confidence=m.confidence,
                evidence_count=1,
                provenance=prov
            ))
            seen_tech.add(t.technique_id)

    # 7. Convert entity maps to schemas
    hosts = [IntelEntityHost(
        hostname=h["hostname"], host_id=h["host_id"], operating_system=h["os"], agent_id=h["agent"],
        event_count=h["ev_count"], alert_count=0, first_observed=h["first"], last_observed=h["last"]
    ) for h in host_map.values()]

    ips = [IntelEntityIp(
        ip_address=ip["ip"], role="/".join(ip["roles"]), event_count=ip["ev_count"], alert_count=0,
        first_observed=ip["first"], last_observed=ip["last"]
    ) for ip in ip_map.values()]

    users = [IntelEntityUser(
        username=u["user"], event_count=u["ev_count"], host_count=len(u["hosts"]), ip_count=len(u["ips"]),
        alert_count=0, first_observed=u["first"], last_observed=u["last"]
    ) for u in user_map.values()]

    rules = [IntelDetectionRule(
        id=r["id"], rule_id=r["rule_id"], name=r["name"], severity=r["severity"], detection_type=r["type"],
        mitre_mappings=r["mitre"], alert_count=r["alerts"], evidence_count=r["ev_count"]
    ) for r in rule_map.values()]

    # 8. Historical Context & Related Investigations
    # If any IP/Host/User has events outside this investigation's time window, we note it.
    historical: List[IntelHistoricalContext] = []
    
    related_inv_stmt = select(InvestigationEvidence.investigation_id, InvestigationModel.title, InvestigationModel.status, InvestigationModel.created_at, InvestigationModel.updated_at, InvestigationEvidence.evidence_type, InvestigationEvidence.reference_id).join(InvestigationModel, InvestigationEvidence.investigation_id == InvestigationModel.id).where(
        InvestigationEvidence.investigation_id != investigation_id,
        or_(
            and_(InvestigationEvidence.evidence_type == "EVENT", InvestigationEvidence.reference_id.in_([str(eid) for eid in all_target_event_ids]) if all_target_event_ids else False),
            and_(InvestigationEvidence.evidence_type == "ALERT", InvestigationEvidence.reference_id.in_([str(aid) for aid in direct_alert_ids]) if direct_alert_ids else False)
        )
    )
    related_inv_res = await db.execute(related_inv_stmt)
    
    related_map = {}
    for r_id, r_title, r_status, r_created, r_updated, r_ev_type, r_ref in related_inv_res.all():
        if r_id not in related_map:
            related_map[r_id] = {
                "id": r_id, "title": r_title, "status": r_status, "created": r_created, "updated": r_updated, "shared": set(), "ev_count": 0
            }
        related_map[r_id]["shared"].add(f"{r_ev_type} {r_ref}")
        related_map[r_id]["ev_count"] += 1
        
    related_invs = [IntelRelatedInvestigation(
        id=r["id"], title=r["title"], status=r["status"], created_at=r["created"], updated_at=r["updated"],
        shared_entity=", ".join(list(r["shared"])[:3]) + ("..." if len(r["shared"]) > 3 else ""),
        evidence_count=r["ev_count"]
    ) for r in related_map.values()]

    if len(event_objs) > 0:
        historical.append(IntelHistoricalContext(
            time_range_type="CURRENT_INVESTIGATION",
            observation=f"Contains {len(event_objs)} normalized events."
        ))

    timeline_summary = IntelTimelineSummary(
        first_event=first_ev_time,
        last_event=last_ev_time,
        total_timeline_events=len(intel_events),
        direct_evidence_count=len(direct_event_ids),
        correlated_events_count=len(triggering_event_ids) - len(direct_event_ids.intersection(triggering_event_ids)),
        alerts_represented=len(intel_alerts),
        mitre_associated_events=len(intel_mitre)
    )

    summary = IntelSummary(
        total_evidence=total_evidence_count,
        events=len(all_target_event_ids),
        raw_logs=len(direct_raw_log_ids),
        alerts=len(direct_alert_ids),
        hosts=len(hosts),
        agents=len(direct_agent_ids),
        source_ips=len([ip for ip in ips if "source" in ip.role]),
        destination_ips=len([ip for ip in ips if "destination" in ip.role]),
        users=len(users),
        mitre_techniques=len(intel_mitre),
        timeline_events=len(intel_events),
        detection_rules=len(rules)
    )

    return InvestigationIntelligenceOverview(
        investigation_id=investigation_id,
        summary=summary,
        hosts=hosts,
        ips=ips,
        users=users,
        alerts=intel_alerts,
        detection_rules=rules,
        mitre=intel_mitre,
        timeline_summary=timeline_summary,
        events=intel_events,
        historical_context=historical,
        related_investigations=related_invs
    )
