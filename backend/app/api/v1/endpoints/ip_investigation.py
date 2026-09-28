import ipaddress
from datetime import datetime, timezone
from typing import Optional, List, Dict, Set, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_, distinct
from sqlalchemy.orm import selectinload

from backend.app.db.session import get_db
from backend.app.models.event import Event as EventModel
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.detection import DetectionResult, DetectionRule as DetectionRuleModel
from backend.app.models.investigation import Investigation as InvestigationModel, InvestigationEvidence
from backend.app.models.host import Host as HostModel
from backend.app.models.agent import Agent as AgentModel
from backend.app.models.mitre import (
    MitreMapping as MitreMappingModel,
    MitreTechnique as MitreTechniqueModel,
    MitreTactic as MitreTacticModel,
    MitreTechniqueTactic as MitreTechniqueTacticModel
)
from backend.app.schemas.event import Event as EventSchema
from backend.app.schemas.alert import Alert as AlertSchema
from backend.app.schemas.pagination import PaginatedResponse
from backend.app.schemas.ip_investigation import (
    IpInvestigationOverview,
    IpSummaryMetrics,
    IpAssociatedAlert,
    IpAssociatedHost,
    IpAssociatedAgent,
    IpAssociatedUser,
    IpAssociatedInvestigation,
    IpAssociatedMitreTechnique
)

router = APIRouter()

def validate_and_classify_ip(ip_str: str):
    raw = ip_str.strip()
    try:
        ip_obj = ipaddress.ip_address(raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid IP address format: '{raw}'. Must be a valid IPv4 or IPv6 address."
        )

    version_str = f"IPv{ip_obj.version}"
    if ip_obj.is_loopback:
        scope = "loopback"
    elif ip_obj.is_private:
        scope = "private"
    elif ip_obj.is_link_local:
        scope = "link-local"
    elif ip_obj.is_multicast:
        scope = "multicast"
    elif ip_obj.is_unspecified:
        scope = "unspecified"
    elif ip_obj.is_global:
        scope = "public"
    else:
        scope = "reserved"

    return str(ip_obj), version_str, scope


@router.get("/{ip}", response_model=IpInvestigationOverview)
async def get_ip_overview(
    ip: str,
    role: Optional[str] = Query(None, pattern="^(source|destination|all)$"),
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    canon_ip, ip_version, address_scope = validate_and_classify_ip(ip)

    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    # Build base event filter for this IP
    if role == "source":
        ip_condition = EventModel.source_ip == canon_ip
    elif role == "destination":
        ip_condition = EventModel.destination_ip == canon_ip
    else:
        ip_condition = or_(EventModel.source_ip == canon_ip, EventModel.destination_ip == canon_ip)

    event_filters = [ip_condition]
    if start_time:
        event_filters.append(EventModel.timestamp >= start_time)
    if end_time:
        event_filters.append(EventModel.timestamp <= end_time)

    combined_event_filter = and_(*event_filters)

    # 1. Aggregates: counts and first/last observed
    agg_stmt = select(
        func.count(EventModel.id).label("total_events"),
        func.min(EventModel.timestamp).label("first_observed"),
        func.max(EventModel.timestamp).label("last_observed"),
        func.count(func.nullif(EventModel.source_ip == canon_ip, False)).label("src_events"),
        func.count(func.nullif(EventModel.destination_ip == canon_ip, False)).label("dst_events")
    ).where(combined_event_filter)

    agg_res = await db.execute(agg_stmt)
    total_events, first_observed, last_observed, src_events, dst_events = agg_res.one()
    total_events = total_events or 0
    src_events = src_events or 0
    dst_events = dst_events or 0

    # 2. Associated Hosts
    host_stmt = select(
        EventModel.hostname,
        EventModel.host_id,
        EventModel.operating_system,
        func.min(EventModel.timestamp).label("first_seen"),
        func.max(EventModel.timestamp).label("last_seen"),
        func.count(EventModel.id).label("cnt"),
        func.bool_or(EventModel.source_ip == canon_ip).label("is_src"),
        func.bool_or(EventModel.destination_ip == canon_ip).label("is_dst")
    ).where(
        combined_event_filter,
        or_(EventModel.hostname.isnot(None), EventModel.host_id.isnot(None))
    ).group_by(
        EventModel.hostname,
        EventModel.host_id,
        EventModel.operating_system
    ).order_by(func.count(EventModel.id).desc())

    host_res = await db.execute(host_stmt)
    associated_hosts: List[IpAssociatedHost] = []
    seen_hostnames: Set[str] = set()
    for hname, hid, os_val, h_first, h_last, h_cnt, is_s, is_d in host_res.all():
        name_key = hname or f"Host-{hid}"
        if name_key in seen_hostnames:
            continue
        seen_hostnames.add(name_key)
        roles = []
        if is_s:
            roles.append("source")
        if is_d:
            roles.append("destination")
        associated_hosts.append(IpAssociatedHost(
            id=hid,
            hostname=name_key,
            operating_system=os_val,
            first_observed=h_first,
            last_observed=h_last,
            event_count=h_cnt,
            roles=roles
        ))

    # 3. Associated Agents
    agent_stmt = select(
        AgentModel.id,
        AgentModel.agent_id,
        AgentModel.hostname,
        AgentModel.operating_system,
        AgentModel.status,
        func.count(EventModel.id).label("cnt")
    ).join(
        EventModel, EventModel.agent_id == AgentModel.id
    ).where(
        combined_event_filter
    ).group_by(
        AgentModel.id,
        AgentModel.agent_id,
        AgentModel.hostname,
        AgentModel.operating_system,
        AgentModel.status
    ).order_by(func.count(EventModel.id).desc())

    agent_res = await db.execute(agent_stmt)
    associated_agents: List[IpAssociatedAgent] = [
        IpAssociatedAgent(
            id=aid,
            agent_id=ag_id,
            hostname=ag_hname,
            operating_system=ag_os,
            status=ag_status,
            event_count=ag_cnt
        )
        for aid, ag_id, ag_hname, ag_os, ag_status, ag_cnt in agent_res.all()
    ]

    # 4. Associated Users
    user_stmt = select(
        EventModel.username,
        func.min(EventModel.timestamp).label("first_seen"),
        func.max(EventModel.timestamp).label("last_seen"),
        func.count(EventModel.id).label("cnt"),
        func.array_agg(distinct(EventModel.hostname))
    ).where(
        combined_event_filter,
        EventModel.username.isnot(None),
        EventModel.username != ""
    ).group_by(
        EventModel.username
    ).order_by(func.count(EventModel.id).desc())

    user_res = await db.execute(user_stmt)
    associated_users: List[IpAssociatedUser] = [
        IpAssociatedUser(
            username=u_name,
            first_observed=u_first,
            last_observed=u_last,
            event_count=u_cnt,
            associated_hosts=[h for h in (u_hosts or []) if h]
        )
        for u_name, u_first, u_last, u_cnt, u_hosts in user_res.all()
    ]

    # 5. Associated Alerts (deduplicated by Alert ID via triggering events)
    alert_subq = select(
        DetectionResult.alert_id,
        func.bool_or(EventModel.source_ip == canon_ip).label("is_src"),
        func.bool_or(EventModel.destination_ip == canon_ip).label("is_dst")
    ).join(
        EventModel, DetectionResult.event_id == EventModel.id
    ).where(
        combined_event_filter,
        DetectionResult.alert_id.isnot(None)
    ).group_by(
        DetectionResult.alert_id
    ).subquery()

    al_stmt = select(
        AlertModel,
        alert_subq.c.is_src,
        alert_subq.c.is_dst
    ).join(
        alert_subq, AlertModel.id == alert_subq.c.alert_id
    ).options(
        selectinload(AlertModel.rule)
    )

    al_res = await db.execute(al_stmt)
    associated_alert_rows = al_res.all()
    unique_alert_ids = [a.id for a, _, _ in associated_alert_rows]
    alerts_count = len(unique_alert_ids)

    # 6. Associated Investigations
    # An investigation is associated if its evidence references an associated Event or Alert
    inv_ids_with_counts: Dict[int, int] = {}

    matching_event_ids_q = select(EventModel.id).where(combined_event_filter)
    matching_event_ids_res = await db.execute(matching_event_ids_q)
    matching_event_ids = [str(eid) for eid in matching_event_ids_res.scalars().all()]

    matching_alert_ids = [str(aid) for aid in unique_alert_ids]

    all_evidence_refs = set(matching_event_ids + matching_alert_ids)

    associated_investigations: List[IpAssociatedInvestigation] = []
    if all_evidence_refs:
        inv_ev_stmt = select(
            InvestigationEvidence.investigation_id,
            func.count(InvestigationEvidence.id).label("ev_cnt")
        ).where(
            or_(
                and_(InvestigationEvidence.evidence_type == "EVENT", InvestigationEvidence.reference_id.in_(list(matching_event_ids)[:1000])),
                and_(InvestigationEvidence.evidence_type == "ALERT", InvestigationEvidence.reference_id.in_(list(matching_alert_ids)[:1000]))
            )
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
                associated_investigations.append(IpAssociatedInvestigation(
                    id=inv_obj.id,
                    title=inv_obj.title,
                    status=inv_obj.status,
                    severity=inv_obj.severity,
                    created_at=inv_obj.created_at,
                    updated_at=inv_obj.updated_at,
                    evidence_count_involving_ip=inv_ids_with_counts.get(inv_obj.id, 0)
                ))

    # 7. Explicit MITRE ATT&CK Mappings connected to evidence
    mitre_techniques_list: List[IpAssociatedMitreTechnique] = []
    seen_mitre_tech_ids: Set[str] = set()

    # A. Event Direct Mappings
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
                mitre_techniques_list.append(IpAssociatedMitreTechnique(
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

    # B. Alert Mappings
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
                mitre_techniques_list.append(IpAssociatedMitreTechnique(
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

        # C. Detection Rule Mappings of Associated Alerts
        rule_ids = [str(a.rule_id) for a, _, _ in associated_alert_rows if a.rule_id]
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
                    mitre_techniques_list.append(IpAssociatedMitreTechnique(
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
    summary = IpSummaryMetrics(
        ip_address=canon_ip,
        ip_version=ip_version,
        address_scope=address_scope,
        first_observed=first_observed,
        last_observed=last_observed,
        total_events=total_events,
        source_events_count=src_events,
        destination_events_count=dst_events,
        alerts_count=alerts_count,
        hosts_count=len(associated_hosts),
        agents_count=len(associated_agents),
        users_count=len(associated_users),
        investigations_count=len(associated_investigations),
        mitre_techniques_count=len(mitre_techniques_list)
    )

    return IpInvestigationOverview(
        summary=summary,
        associated_hosts=associated_hosts,
        associated_agents=associated_agents,
        associated_users=associated_users,
        associated_investigations=associated_investigations,
        mitre_techniques=mitre_techniques_list
    )


@router.get("/{ip}/events", response_model=PaginatedResponse[EventSchema])
async def get_ip_events(
    ip: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    role: Optional[str] = Query(None, pattern="^(source|destination|all)$"),
    event_category: Optional[str] = None,
    event_type: Optional[str] = None,
    protocol: Optional[str] = None,
    action: Optional[str] = None,
    severity: Optional[str] = None,
    hostname: Optional[str] = None,
    username: Optional[str] = None,
    search: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    canon_ip, _, _ = validate_and_classify_ip(ip)

    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    if role == "source":
        ip_condition = EventModel.source_ip == canon_ip
    elif role == "destination":
        ip_condition = EventModel.destination_ip == canon_ip
    else:
        ip_condition = or_(EventModel.source_ip == canon_ip, EventModel.destination_ip == canon_ip)

    stmt = select(EventModel).where(ip_condition)

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
    if hostname:
        stmt = stmt.where(EventModel.hostname.ilike(f"%{hostname}%"))
    if username:
        stmt = stmt.where(EventModel.username.ilike(f"%{username}%"))
    if start_time:
        stmt = stmt.where(EventModel.timestamp >= start_time)
    if end_time:
        stmt = stmt.where(EventModel.timestamp <= end_time)
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


@router.get("/{ip}/alerts", response_model=PaginatedResponse[IpAssociatedAlert])
async def get_ip_alerts(
    ip: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    canon_ip, _, _ = validate_and_classify_ip(ip)

    ip_condition = or_(EventModel.source_ip == canon_ip, EventModel.destination_ip == canon_ip)

    alert_subq = select(
        DetectionResult.alert_id,
        func.bool_or(EventModel.source_ip == canon_ip).label("is_src"),
        func.bool_or(EventModel.destination_ip == canon_ip).label("is_dst")
    ).join(
        EventModel, DetectionResult.event_id == EventModel.id
    ).where(
        ip_condition,
        DetectionResult.alert_id.isnot(None)
    ).group_by(
        DetectionResult.alert_id
    ).subquery()

    stmt = select(
        AlertModel,
        alert_subq.c.is_src,
        alert_subq.c.is_dst
    ).join(
        alert_subq, AlertModel.id == alert_subq.c.alert_id
    ).options(
        selectinload(AlertModel.rule),
        selectinload(AlertModel.host)
    )

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
    rows = result.all()

    alert_items: List[IpAssociatedAlert] = []
    rule_ids = [str(al.rule_id) for al, _, _ in rows if al.rule_id]
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

    for al, is_s, is_d in rows:
        roles = []
        if is_s:
            roles.append("source")
        if is_d:
            roles.append("destination")
        r_name = al.rule.name if al.rule else None
        h_name = al.host.hostname if al.host else None
        techs = rule_tech_map.get(str(al.rule_id), []) if al.rule_id else []

        alert_items.append(IpAssociatedAlert(
            id=al.id,
            alert_id=al.alert_id,
            title=al.title,
            severity=al.severity,
            status=al.status,
            first_seen=al.first_seen,
            last_seen=al.last_seen,
            occurrence_count=al.occurrence_count,
            observed_roles=roles,
            hostname=h_name,
            rule_id=al.rule_id,
            rule_name=r_name,
            mitre_techniques=techs
        ))

    return PaginatedResponse(
        items=alert_items,
        page=page,
        page_size=page_size,
        total=total
    )
