from datetime import datetime, timezone
from typing import Optional, List, Dict, Set, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_, distinct
from sqlalchemy.orm import selectinload

from backend.app.db.session import get_db
from backend.app.models.host import Host as HostModel
from backend.app.models.agent import Agent as AgentModel
from backend.app.models.event import Event as EventModel
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.detection import DetectionResult, DetectionRule as DetectionRuleModel
from backend.app.models.investigation import Investigation as InvestigationModel, InvestigationEvidence
from backend.app.models.mitre import (
    MitreMapping as MitreMappingModel,
    MitreTechnique as MitreTechniqueModel,
    MitreTactic as MitreTacticModel,
    MitreTechniqueTactic as MitreTechniqueTacticModel
)
from backend.app.schemas.event import Event as EventSchema
from backend.app.schemas.pagination import PaginatedResponse
from backend.app.schemas.host_investigation import (
    HostIdentity,
    HostAssociatedAgent,
    HostSummaryMetrics,
    HostAssociatedAlert,
    HostObservedUser,
    HostAssociatedIp,
    HostAssociatedInvestigation,
    HostAssociatedMitreTechnique,
    HostInvestigationOverview
)

router = APIRouter()

async def resolve_host(identifier_or_id: str, db: AsyncSession) -> HostModel:
    raw = identifier_or_id.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Host identifier cannot be empty")

    stmt = select(HostModel).options(selectinload(HostModel.agents))
    if raw.isdigit():
        stmt = stmt.where(HostModel.id == int(raw))
    else:
        stmt = stmt.where(or_(HostModel.host_identifier == raw, HostModel.hostname == raw))

    res = await db.execute(stmt)
    host = res.scalars().first()
    if not host:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Host '{raw}' not found"
        )
    return host


def build_host_event_filter(host: HostModel, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None):
    host_match = or_(
        EventModel.host_id == host.id,
        EventModel.hostname == host.hostname
    )
    filters = [host_match]
    if start_time:
        filters.append(EventModel.timestamp >= start_time)
    if end_time:
        filters.append(EventModel.timestamp <= end_time)
    return and_(*filters)


@router.get("/{host_id}", response_model=HostInvestigationOverview)
async def get_host_overview(
    host_id: str,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    host = await resolve_host(host_id, db)
    combined_filter = build_host_event_filter(host, start_time, end_time)

    # 1. Event Metrics (Counts and Canonical First/Last Seen)
    agg_stmt = select(
        func.count(EventModel.id).label("total_events"),
        func.min(EventModel.timestamp).label("first_observed"),
        func.max(EventModel.timestamp).label("last_observed")
    ).where(combined_filter)

    agg_res = await db.execute(agg_stmt)
    total_events, first_observed, last_observed = agg_res.one()
    total_events = total_events or 0

    # 2. Associated Agents
    associated_agents = [
        HostAssociatedAgent(
            id=ag.id,
            agent_id=ag.agent_id,
            hostname=ag.hostname,
            operating_system=ag.operating_system,
            agent_version=ag.agent_version,
            status=ag.status,
            last_heartbeat=ag.last_heartbeat,
            last_seen=ag.last_seen,
            registered_at=ag.registered_at,
            ip_address=ag.ip_address
        )
        for ag in (host.agents or [])
    ]

    # 3. Observed Users
    user_stmt = select(
        EventModel.username,
        func.count(EventModel.id).label("cnt"),
        func.min(EventModel.timestamp).label("first_seen"),
        func.max(EventModel.timestamp).label("last_seen"),
        func.array_agg(distinct(EventModel.source_ip))
    ).where(
        combined_filter,
        EventModel.username.isnot(None),
        EventModel.username != ""
    ).group_by(
        EventModel.username
    ).order_by(func.count(EventModel.id).desc())

    user_res = await db.execute(user_stmt)
    users_list: List[HostObservedUser] = [
        HostObservedUser(
            username=u_name,
            event_count=cnt,
            first_observed=f_seen,
            last_observed=l_seen,
            associated_ips=[ip for ip in (raw_ips or []) if ip]
        )
        for u_name, cnt, f_seen, l_seen, raw_ips in user_res.all()
    ]

    # 4. Source IPs
    src_ip_stmt = select(
        EventModel.source_ip,
        func.count(EventModel.id).label("cnt"),
        func.min(EventModel.timestamp).label("first_seen"),
        func.max(EventModel.timestamp).label("last_seen")
    ).where(
        combined_filter,
        EventModel.source_ip.isnot(None),
        EventModel.source_ip != ""
    ).group_by(
        EventModel.source_ip
    ).order_by(func.count(EventModel.id).desc())

    src_res = await db.execute(src_ip_stmt)
    source_ips_list: List[HostAssociatedIp] = [
        HostAssociatedIp(
            ip_address=ip,
            event_count=cnt,
            first_observed=f_seen,
            last_observed=l_seen
        )
        for ip, cnt, f_seen, l_seen in src_res.all()
    ]

    # 5. Destination IPs
    dst_ip_stmt = select(
        EventModel.destination_ip,
        func.count(EventModel.id).label("cnt"),
        func.min(EventModel.timestamp).label("first_seen"),
        func.max(EventModel.timestamp).label("last_seen")
    ).where(
        combined_filter,
        EventModel.destination_ip.isnot(None),
        EventModel.destination_ip != ""
    ).group_by(
        EventModel.destination_ip
    ).order_by(func.count(EventModel.id).desc())

    dst_res = await db.execute(dst_ip_stmt)
    destination_ips_list: List[HostAssociatedIp] = [
        HostAssociatedIp(
            ip_address=ip,
            event_count=cnt,
            first_observed=f_seen,
            last_observed=l_seen
        )
        for ip, cnt, f_seen, l_seen in dst_res.all()
    ]

    # 6. Associated Alerts (Deduplicated alerts referencing host directly or via triggering events)
    alert_ids_from_events_subq = select(
        DetectionResult.alert_id
    ).join(
        EventModel, DetectionResult.event_id == EventModel.id
    ).where(
        combined_filter,
        DetectionResult.alert_id.isnot(None)
    ).distinct()

    al_ev_res = await db.execute(alert_ids_from_events_subq)
    event_alert_ids = set(al_ev_res.scalars().all())

    # Alerts directly linking to this host (bounded by time if supplied)
    direct_al_filters = [AlertModel.host_id == host.id]
    if start_time:
        direct_al_filters.append(AlertModel.last_seen >= start_time)
    if end_time:
        direct_al_filters.append(AlertModel.first_seen <= end_time)

    direct_al_q = select(AlertModel.id).where(and_(*direct_al_filters))
    direct_al_res = await db.execute(direct_al_q)
    direct_alert_ids = set(direct_al_res.scalars().all())

    all_associated_alert_ids = list(event_alert_ids | direct_alert_ids)
    alerts_count = len(all_associated_alert_ids)

    # 7. Associated Investigations
    # An investigation is associated if its evidence references this host, its associated events, or its alerts
    matching_event_ids_q = select(EventModel.id).where(combined_filter)
    matching_event_ids_res = await db.execute(matching_event_ids_q)
    matching_event_ids = [str(eid) for eid in matching_event_ids_res.scalars().all()]

    matching_alert_ids = [str(aid) for aid in all_associated_alert_ids]
    host_ref_ids = [str(host.id), str(host.host_identifier), host.hostname]

    inv_ids_with_counts: Dict[int, int] = {}
    associated_investigations: List[HostAssociatedInvestigation] = []

    inv_ev_conditions = [
        and_(InvestigationEvidence.evidence_type == "HOST", InvestigationEvidence.reference_id.in_(host_ref_ids))
    ]
    if matching_event_ids:
        inv_ev_conditions.append(
            and_(InvestigationEvidence.evidence_type == "EVENT", InvestigationEvidence.reference_id.in_(matching_event_ids[:1000]))
        )
    if matching_alert_ids:
        inv_ev_conditions.append(
            and_(InvestigationEvidence.evidence_type == "ALERT", InvestigationEvidence.reference_id.in_(matching_alert_ids[:1000]))
        )

    inv_ev_stmt = select(
        InvestigationEvidence.investigation_id,
        func.count(InvestigationEvidence.id).label("ev_cnt")
    ).where(
        or_(*inv_ev_conditions)
    ).group_by(
        InvestigationEvidence.investigation_id
    )

    inv_ev_res = await db.execute(inv_ev_stmt)
    for inv_id, ev_cnt in inv_ev_res.all():
        inv_ids_with_counts[inv_id] = ev_cnt

    if inv_ids_with_counts:
        inv_objs_q = select(InvestigationModel).where(InvestigationModel.id.in_(list(inv_ids_with_counts.keys()))).order_by(InvestigationModel.updated_at.desc())
        inv_objs_res = await db.execute(inv_objs_q)
        for inv_obj in inv_objs_res.scalars().all():
            associated_investigations.append(HostAssociatedInvestigation(
                id=inv_obj.id,
                title=inv_obj.title,
                status=inv_obj.status,
                severity=inv_obj.severity,
                created_at=inv_obj.created_at,
                updated_at=inv_obj.updated_at,
                evidence_count_involving_host=inv_ids_with_counts.get(inv_obj.id, 0)
            ))

    # 8. Explicit MITRE ATT&CK Mappings Connected to Host Evidence
    mitre_techniques_list: List[HostAssociatedMitreTechnique] = []
    seen_mitre_tech_ids: Set[str] = set()

    # A. Host Direct Mappings
    host_mitre_q = (
        select(MitreMappingModel, MitreTechniqueModel)
        .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
        .options(selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic))
        .where(
            MitreMappingModel.target_type == "HOST",
            MitreMappingModel.target_id.in_(host_ref_ids)
        )
    )
    host_mitre_res = await db.execute(host_mitre_q)
    for m, t in host_mitre_res.all():
        if t.technique_id not in seen_mitre_tech_ids:
            tactics = [
                {"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name}
                for tt in t.tactics if tt.tactic
            ]
            mitre_techniques_list.append(HostAssociatedMitreTechnique(
                technique_id=t.technique_id,
                name=t.name,
                tactics=tactics,
                is_subtechnique=t.is_subtechnique,
                parent_technique_id=t.parent_technique_id,
                source=m.mapping_source,
                confidence=m.confidence,
                relationship="Host Direct Mapping",
                evidence_reference=m.evidence_reference or f"Host {host.hostname}"
            ))
            seen_mitre_tech_ids.add(t.technique_id)

    # B. Event Direct Mappings
    if matching_event_ids:
        ev_mitre_q = (
            select(MitreMappingModel, MitreTechniqueModel)
            .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
            .options(selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic))
            .where(
                MitreMappingModel.target_type == "EVENT",
                MitreMappingModel.target_id.in_(matching_event_ids[:500])
            )
        )
        ev_mitre_res = await db.execute(ev_mitre_q)
        for m, t in ev_mitre_res.all():
            if t.technique_id not in seen_mitre_tech_ids:
                tactics = [
                    {"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name}
                    for tt in t.tactics if tt.tactic
                ]
                mitre_techniques_list.append(HostAssociatedMitreTechnique(
                    technique_id=t.technique_id,
                    name=t.name,
                    tactics=tactics,
                    is_subtechnique=t.is_subtechnique,
                    parent_technique_id=t.parent_technique_id,
                    source=m.mapping_source,
                    confidence=m.confidence,
                    relationship="Event Direct Mapping",
                    evidence_reference=m.evidence_reference or f"Event #{m.target_id}"
                ))
                seen_mitre_tech_ids.add(t.technique_id)

    # C. Alert Mappings
    if matching_alert_ids:
        al_mitre_q = (
            select(MitreMappingModel, MitreTechniqueModel)
            .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
            .options(selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic))
            .where(
                MitreMappingModel.target_type == "ALERT",
                MitreMappingModel.target_id.in_(matching_alert_ids[:500])
            )
        )
        al_mitre_res = await db.execute(al_mitre_q)
        for m, t in al_mitre_res.all():
            if t.technique_id not in seen_mitre_tech_ids:
                tactics = [
                    {"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name}
                    for tt in t.tactics if tt.tactic
                ]
                mitre_techniques_list.append(HostAssociatedMitreTechnique(
                    technique_id=t.technique_id,
                    name=t.name,
                    tactics=tactics,
                    is_subtechnique=t.is_subtechnique,
                    parent_technique_id=t.parent_technique_id,
                    source=m.mapping_source,
                    confidence=m.confidence,
                    relationship="Alert Mapping",
                    evidence_reference=m.evidence_reference or f"Alert #{m.target_id}"
                ))
                seen_mitre_tech_ids.add(t.technique_id)

        # D. Detection Rule Mappings of Associated Alerts
        al_rows_res = await db.execute(select(AlertModel.rule_id).where(AlertModel.id.in_([int(aid) for aid in matching_alert_ids if aid.isdigit()])))
        rule_ids = [str(r_id) for r_id in al_rows_res.scalars().all() if r_id]
        if rule_ids:
            rule_mitre_q = (
                select(MitreMappingModel, MitreTechniqueModel)
                .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
                .options(selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic))
                .where(
                    MitreMappingModel.target_type == "DETECTION_RULE",
                    MitreMappingModel.target_id.in_(list(set(rule_ids)))
                )
            )
            rule_mitre_res = await db.execute(rule_mitre_q)
            for m, t in rule_mitre_res.all():
                if t.technique_id not in seen_mitre_tech_ids:
                    tactics = [
                        {"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name}
                        for tt in t.tactics if tt.tactic
                    ]
                    mitre_techniques_list.append(HostAssociatedMitreTechnique(
                        technique_id=t.technique_id,
                        name=t.name,
                        tactics=tactics,
                        is_subtechnique=t.is_subtechnique,
                        parent_technique_id=t.parent_technique_id,
                        source=m.mapping_source,
                        confidence=m.confidence,
                        relationship="Detection Rule Mapping",
                        evidence_reference=m.evidence_reference or f"Rule #{m.target_id} (via Alert)"
                    ))
                    seen_mitre_tech_ids.add(t.technique_id)

    # Compile Summary
    summary = HostSummaryMetrics(
        host_id=host.id,
        hostname=host.hostname,
        operating_system=host.operating_system,
        first_observed=first_observed,
        last_observed=last_observed,
        total_events=total_events,
        alerts_count=alerts_count,
        users_count=len(users_list),
        source_ips_count=len(source_ips_list),
        destination_ips_count=len(destination_ips_list),
        investigations_count=len(associated_investigations),
        mitre_techniques_count=len(mitre_techniques_list)
    )

    host_identity = HostIdentity.model_validate(host)

    return HostInvestigationOverview(
        host=host_identity,
        agents=associated_agents,
        summary=summary,
        users=users_list,
        source_ips=source_ips_list,
        destination_ips=destination_ips_list,
        investigations=associated_investigations,
        mitre_techniques=mitre_techniques_list
    )


@router.get("/{host_id}/events", response_model=PaginatedResponse[EventSchema])
async def get_host_events(
    host_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    event_category: Optional[str] = None,
    event_type: Optional[str] = None,
    protocol: Optional[str] = None,
    action: Optional[str] = None,
    severity: Optional[str] = None,
    username: Optional[str] = None,
    source_ip: Optional[str] = None,
    destination_ip: Optional[str] = None,
    source_port: Optional[int] = None,
    destination_port: Optional[int] = None,
    search: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    host = await resolve_host(host_id, db)
    combined_filter = build_host_event_filter(host, start_time, end_time)

    stmt = select(EventModel).where(combined_filter)

    if event_category:
        stmt = stmt.where(EventModel.event_category == event_category)
    if event_type:
        stmt = stmt.where(EventModel.event_type == event_type)
    if protocol:
        stmt = stmt.where(func.lower(EventModel.protocol) == protocol.lower())
    if action:
        stmt = stmt.where(func.lower(EventModel.action) == action.lower())
    if severity:
        stmt = stmt.where(EventModel.severity == severity)
    if username:
        stmt = stmt.where(EventModel.username.ilike(f"%{username}%"))
    if source_ip:
        stmt = stmt.where(EventModel.source_ip == source_ip)
    if destination_ip:
        stmt = stmt.where(EventModel.destination_ip == destination_ip)
    if source_port is not None:
        stmt = stmt.where(EventModel.source_port == source_port)
    if destination_port is not None:
        stmt = stmt.where(EventModel.destination_port == destination_port)
    if search:
        s_term = f"%{search.strip()}%"
        stmt = stmt.where(or_(
            EventModel.username.ilike(s_term),
            EventModel.hostname.ilike(s_term),
            EventModel.event_type.ilike(s_term),
            EventModel.source_type.ilike(s_term),
            EventModel.event_id.ilike(s_term)
        ))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(EventModel.timestamp.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    items = result.scalars().all()

    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )


@router.get("/{host_id}/alerts", response_model=PaginatedResponse[HostAssociatedAlert])
async def get_host_alerts(
    host_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    severity: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    host = await resolve_host(host_id, db)
    combined_filter = build_host_event_filter(host, start_time, end_time)

    # 1. Alert IDs from events
    alert_ids_from_events_subq = select(
        DetectionResult.alert_id
    ).join(
        EventModel, DetectionResult.event_id == EventModel.id
    ).where(
        combined_filter,
        DetectionResult.alert_id.isnot(None)
    ).distinct()

    al_ev_res = await db.execute(alert_ids_from_events_subq)
    event_alert_ids = set(al_ev_res.scalars().all())

    # 2. Alerts directly linking to host
    direct_al_filters = [AlertModel.host_id == host.id]
    if start_time:
        direct_al_filters.append(AlertModel.last_seen >= start_time)
    if end_time:
        direct_al_filters.append(AlertModel.first_seen <= end_time)

    direct_al_q = select(AlertModel.id).where(and_(*direct_al_filters))
    direct_al_res = await db.execute(direct_al_q)
    direct_alert_ids = set(direct_al_res.scalars().all())

    all_alert_ids = list(event_alert_ids | direct_alert_ids)

    if not all_alert_ids:
        return PaginatedResponse(items=[], page=page, page_size=page_size, total=0)

    stmt = select(AlertModel).where(AlertModel.id.in_(all_alert_ids)).options(selectinload(AlertModel.rule))

    if status:
        stmt = stmt.where(AlertModel.status == status)
    if severity:
        stmt = stmt.where(AlertModel.severity == severity)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(AlertModel.last_seen.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    alerts = result.scalars().all()

    rule_ids = [str(al.rule_id) for al in alerts if al.rule_id]
    rule_tech_map: Dict[str, List[str]] = {}
    if rule_ids:
        r_mitre_q = select(MitreMappingModel.target_id, MitreMappingModel.technique_id).where(
            MitreMappingModel.target_type == "DETECTION_RULE",
            MitreMappingModel.target_id.in_(rule_ids)
        )
        r_res = await db.execute(r_mitre_q)
        for r_target_id, t_id in r_res.all():
            if r_target_id not in rule_tech_map:
                rule_tech_map[r_target_id] = []
            rule_tech_map[r_target_id].append(t_id)

    items: List[HostAssociatedAlert] = []
    for al in alerts:
        r_name = al.rule.name if al.rule else None
        techs = rule_tech_map.get(str(al.rule_id), []) if al.rule_id else []
        items.append(HostAssociatedAlert(
            id=al.id,
            alert_id=al.alert_id,
            title=al.title,
            severity=al.severity,
            status=al.status,
            first_seen=al.first_seen,
            last_seen=al.last_seen,
            occurrence_count=al.occurrence_count,
            rule_id=al.rule_id,
            rule_name=r_name,
            mitre_techniques=techs
        ))

    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )
