from datetime import datetime
from typing import Optional, List, Dict, Set
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
from backend.app.models.mitre import (
    MitreMapping as MitreMappingModel,
    MitreTechnique as MitreTechniqueModel,
    MitreTechniqueTactic as MitreTechniqueTacticModel
)
from backend.app.schemas.user_context import (
    UserContextOverview,
    UserContextSummary,
    UserObservedHost,
    UserObservedIp,
    UserAssociatedAlert,
    UserAssociatedInvestigation,
    UserAssociatedMitreTechnique,
    UserActivityBreakdown
)
from backend.app.schemas.pagination import PaginatedResponse
from backend.app.schemas.event import Event as EventSchema

router = APIRouter()


@router.get("/{username}", response_model=UserContextOverview)
async def get_user_context(
    username: str,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    uname = username.strip()
    if not uname:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    base_filters = [EventModel.username == uname]
    if start_time:
        base_filters.append(EventModel.timestamp >= start_time)
    if end_time:
        base_filters.append(EventModel.timestamp <= end_time)
    combined_filter = and_(*base_filters)

    # 1. Aggregates
    agg_stmt = select(
        func.count(EventModel.id).label("total_events"),
        func.min(EventModel.timestamp).label("first_observed"),
        func.max(EventModel.timestamp).label("last_observed")
    ).where(combined_filter)

    agg_res = await db.execute(agg_stmt)
    total_events, first_observed, last_observed = agg_res.one()
    total_events = total_events or 0

    if total_events == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No events found for username '{uname}'"
        )

    # 2. Observed Hosts
    host_stmt = select(
        EventModel.host_id,
        EventModel.hostname,
        EventModel.operating_system,
        func.count(EventModel.id).label("cnt"),
        func.min(EventModel.timestamp).label("first_seen"),
        func.max(EventModel.timestamp).label("last_seen")
    ).where(
        combined_filter,
        or_(EventModel.hostname.isnot(None), EventModel.host_id.isnot(None))
    ).group_by(
        EventModel.host_id,
        EventModel.hostname,
        EventModel.operating_system
    ).order_by(func.count(EventModel.id).desc())

    host_res = await db.execute(host_stmt)
    seen_host_keys: Set[str] = set()
    hosts_list: List[UserObservedHost] = []
    for h_id, h_name, h_os, cnt, f_seen, l_seen in host_res.all():
        key = h_name or f"host-{h_id}"
        if key in seen_host_keys:
            continue
        seen_host_keys.add(key)
        hosts_list.append(UserObservedHost(
            id=h_id,
            hostname=key,
            operating_system=h_os,
            event_count=cnt,
            first_observed=f_seen,
            last_observed=l_seen
        ))

    # 3. Source IPs
    src_ip_stmt = select(
        EventModel.source_ip,
        func.count(EventModel.id).label("cnt"),
        func.min(EventModel.timestamp).label("first_seen"),
        func.max(EventModel.timestamp).label("last_seen")
    ).where(
        combined_filter,
        EventModel.source_ip.isnot(None),
        EventModel.source_ip != ""
    ).group_by(EventModel.source_ip).order_by(func.count(EventModel.id).desc())

    src_res = await db.execute(src_ip_stmt)
    source_ips: List[UserObservedIp] = [
        UserObservedIp(ip_address=ip, role="source", event_count=cnt, first_observed=f_seen, last_observed=l_seen)
        for ip, cnt, f_seen, l_seen in src_res.all()
    ]

    # 4. Destination IPs
    dst_ip_stmt = select(
        EventModel.destination_ip,
        func.count(EventModel.id).label("cnt"),
        func.min(EventModel.timestamp).label("first_seen"),
        func.max(EventModel.timestamp).label("last_seen")
    ).where(
        combined_filter,
        EventModel.destination_ip.isnot(None),
        EventModel.destination_ip != ""
    ).group_by(EventModel.destination_ip).order_by(func.count(EventModel.id).desc())

    dst_res = await db.execute(dst_ip_stmt)
    destination_ips: List[UserObservedIp] = [
        UserObservedIp(ip_address=ip, role="destination", event_count=cnt, first_observed=f_seen, last_observed=l_seen)
        for ip, cnt, f_seen, l_seen in dst_res.all()
    ]

    # 5. Activity Breakdown by event category
    cat_stmt = select(
        EventModel.event_category,
        func.count(EventModel.id).label("cnt")
    ).where(
        combined_filter,
        EventModel.event_category.isnot(None)
    ).group_by(EventModel.event_category).order_by(func.count(EventModel.id).desc())

    cat_res = await db.execute(cat_stmt)
    activity_breakdown: List[UserActivityBreakdown] = [
        UserActivityBreakdown(event_category=cat, event_count=cnt)
        for cat, cnt in cat_res.all()
    ]

    # 6. Associated Alerts (via event → detection result → alert)
    matching_event_ids_q = select(EventModel.id).where(combined_filter)
    matching_event_ids_res = await db.execute(matching_event_ids_q)
    matching_event_ids = [str(eid) for eid in matching_event_ids_res.scalars().all()]

    alert_ids_set: Set[int] = set()
    if matching_event_ids:
        al_subq = select(DetectionResult.alert_id).where(
            DetectionResult.alert_id.isnot(None),
            DetectionResult.event_id.in_([int(eid) for eid in matching_event_ids if eid.isdigit()])
        ).distinct()
        al_res = await db.execute(al_subq)
        alert_ids_set = set(al_res.scalars().all())

    alerts_list: List[UserAssociatedAlert] = []
    if alert_ids_set:
        al_objs_q = select(AlertModel).options(selectinload(AlertModel.rule)).where(AlertModel.id.in_(list(alert_ids_set))).order_by(AlertModel.last_seen.desc())
        al_objs_res = await db.execute(al_objs_q)
        for al in al_objs_res.scalars().all():
            alerts_list.append(UserAssociatedAlert(
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

    # 7. Associated Investigations (via events or alerts in evidence)
    matching_alert_ids = [str(aid) for aid in alert_ids_set]
    inv_ids_with_counts: Dict[int, int] = {}
    associated_investigations: List[UserAssociatedInvestigation] = []

    inv_conditions = []
    if matching_event_ids:
        inv_conditions.append(
            and_(InvestigationEvidence.evidence_type == "EVENT", InvestigationEvidence.reference_id.in_(matching_event_ids[:1000]))
        )
    if matching_alert_ids:
        inv_conditions.append(
            and_(InvestigationEvidence.evidence_type == "ALERT", InvestigationEvidence.reference_id.in_(matching_alert_ids[:1000]))
        )

    if inv_conditions:
        inv_ev_stmt = select(
            InvestigationEvidence.investigation_id,
            func.count(InvestigationEvidence.id).label("ev_cnt")
        ).where(or_(*inv_conditions)).group_by(InvestigationEvidence.investigation_id)
        inv_ev_res = await db.execute(inv_ev_stmt)
        for inv_id, ev_cnt in inv_ev_res.all():
            inv_ids_with_counts[inv_id] = ev_cnt

        if inv_ids_with_counts:
            inv_objs_q = select(InvestigationModel).where(
                InvestigationModel.id.in_(list(inv_ids_with_counts.keys()))
            ).order_by(InvestigationModel.updated_at.desc())
            inv_objs_res = await db.execute(inv_objs_q)
            for inv_obj in inv_objs_res.scalars().all():
                associated_investigations.append(UserAssociatedInvestigation(
                    id=inv_obj.id,
                    title=inv_obj.title,
                    status=inv_obj.status,
                    severity=inv_obj.severity,
                    created_at=inv_obj.created_at,
                    updated_at=inv_obj.updated_at,
                    evidence_count_involving_user=inv_ids_with_counts.get(inv_obj.id, 0)
                ))

    # 8. Explicit MITRE ATT&CK Mappings (event and alert level only)
    mitre_list: List[UserAssociatedMitreTechnique] = []
    seen_tech_ids: Set[str] = set()

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
            if t.technique_id not in seen_tech_ids:
                tactics = [{"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name} for tt in t.tactics if tt.tactic]
                mitre_list.append(UserAssociatedMitreTechnique(
                    technique_id=t.technique_id, name=t.name, tactics=tactics,
                    is_subtechnique=t.is_subtechnique, parent_technique_id=t.parent_technique_id,
                    source=m.mapping_source, confidence=m.confidence,
                    relationship="Event Direct Mapping",
                    evidence_reference=m.evidence_reference or f"Event #{m.target_id}"
                ))
                seen_tech_ids.add(t.technique_id)

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
            if t.technique_id not in seen_tech_ids:
                tactics = [{"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name} for tt in t.tactics if tt.tactic]
                mitre_list.append(UserAssociatedMitreTechnique(
                    technique_id=t.technique_id, name=t.name, tactics=tactics,
                    is_subtechnique=t.is_subtechnique, parent_technique_id=t.parent_technique_id,
                    source=m.mapping_source, confidence=m.confidence,
                    relationship="Alert Mapping",
                    evidence_reference=m.evidence_reference or f"Alert #{m.target_id}"
                ))
                seen_tech_ids.add(t.technique_id)

    summary = UserContextSummary(
        username=uname,
        first_observed=first_observed,
        last_observed=last_observed,
        total_events=total_events,
        hosts_count=len(hosts_list),
        source_ips_count=len(source_ips),
        destination_ips_count=len(destination_ips),
        alerts_count=len(alerts_list),
        investigations_count=len(associated_investigations),
        mitre_techniques_count=len(mitre_list)
    )

    return UserContextOverview(
        summary=summary,
        hosts=hosts_list,
        source_ips=source_ips,
        destination_ips=destination_ips,
        alerts=alerts_list,
        investigations=associated_investigations,
        mitre_techniques=mitre_list,
        activity_breakdown=activity_breakdown
    )


@router.get("/{username}/events", response_model=PaginatedResponse[EventSchema])
async def get_user_events(
    username: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    event_category: Optional[str] = None,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    hostname: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    uname = username.strip()
    if not uname:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    stmt = select(EventModel).where(EventModel.username == uname)

    if event_category:
        stmt = stmt.where(EventModel.event_category == event_category)
    if event_type:
        stmt = stmt.where(EventModel.event_type == event_type)
    if severity:
        stmt = stmt.where(EventModel.severity == severity)
    if hostname:
        stmt = stmt.where(EventModel.hostname.ilike(f"%{hostname}%"))
    if start_time:
        stmt = stmt.where(EventModel.timestamp >= start_time)
    if end_time:
        stmt = stmt.where(EventModel.timestamp <= end_time)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(EventModel.timestamp.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    items = result.scalars().all()

    return PaginatedResponse(items=items, page=page, page_size=page_size, total=total)
