from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import selectinload
from typing import Optional, List, Set, Dict, Any
from datetime import datetime, timedelta

from backend.app.db.session import get_db
from backend.app.models.event import Event as EventModel
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.detection import DetectionResult
from backend.app.models.investigation import Investigation as InvestigationModel, InvestigationEvidence
from backend.app.models.raw_log import RawLog as RawLogModel
from backend.app.models.host import Host as HostModel
from backend.app.models.agent import Agent as AgentModel
from backend.app.schemas.timeline import TimelineItem, TimelineResponse, InvestigationTimelineMeta, TimelineSummaryMetrics

router = APIRouter()

def _extract_timeline_item(
    ev: EventModel,
    provenance: Optional[str] = None,
    context_type: Optional[str] = None,
    context_reason: Optional[str] = None,
    alert_id: Optional[str] = None,
    alert_title: Optional[str] = None,
    alert_severity: Optional[str] = None,
    investigation_id: Optional[int] = None,
    investigation_title: Optional[str] = None,
    investigation_status: Optional[str] = None,
    related_event_count: Optional[int] = None,
    related_event_ids: Optional[List[int]] = None
) -> TimelineItem:
    meta = ev.metadata_ if isinstance(ev.metadata_, dict) else {}
    proc_name = (
        meta.get("process_name")
        or meta.get("process")
        or meta.get("Image")
        or meta.get("comm")
    )
    cmd_line = (
        meta.get("command_line")
        or meta.get("cmdline")
        or meta.get("CommandLine")
    )

    h_name = ev.hostname or (ev.host.hostname if ev.host else None)
    os_name = ev.operating_system or (ev.host.operating_system if ev.host else None)

    return TimelineItem(
        id=ev.id,
        event_id=ev.event_id,
        timestamp=ev.timestamp,
        received_at=ev.received_at,
        event_type=ev.event_type,
        event_category=ev.event_category,
        severity=ev.severity,
        hostname=h_name,
        operating_system=os_name,
        agent_id=ev.agent_id,
        host_id=ev.host_id,
        username=ev.username,
        source_ip=ev.source_ip,
        source_port=ev.source_port,
        destination_ip=ev.destination_ip,
        destination_port=ev.destination_port,
        protocol=ev.protocol,
        action=ev.action,
        process_name=str(proc_name) if proc_name is not None else None,
        command_line=str(cmd_line) if cmd_line is not None else None,
        source_type=ev.source_type,
        raw_log_id=ev.raw_log_id,
        provenance=provenance or context_type or "OTHER",
        context_type=context_type or provenance or "OTHER",
        context_reason=context_reason,
        alert_id=alert_id,
        alert_title=alert_title,
        alert_severity=alert_severity,
        investigation_id=investigation_id,
        investigation_title=investigation_title,
        investigation_status=investigation_status,
        related_event_count=related_event_count,
        related_event_ids=related_event_ids,
        metadata_=ev.metadata_
    )


@router.get("/", response_model=TimelineResponse)
@router.get("", response_model=TimelineResponse, include_in_schema=False)
async def get_attack_timeline(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    hostname: Optional[str] = None,
    agent_id: Optional[int] = None,
    username: Optional[str] = None,
    source_ip: Optional[str] = None,
    destination_ip: Optional[str] = None,
    event_type: Optional[str] = None,
    event_category: Optional[str] = None,
    severity: Optional[str] = None,
    investigation_id: Optional[int] = None,
    alert_id: Optional[str] = None,
    provenance: Optional[str] = Query(None, description="Filter: DIRECT_EVIDENCE, CORRELATED_EVENT, ALERT_CONTEXT"),
    time_window_minutes: int = Query(15, ge=1, le=1440),
    search: Optional[str] = None,
    order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db)
):
    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    direct_event_ids: Set[int] = set()
    alert_trigger_event_ids: Set[int] = set()
    context_hostnames: Set[str] = set()
    context_agent_ids: Set[int] = set()
    context_ips: Set[str] = set()
    context_users: Set[str] = set()
    event_to_alert_id: Dict[int, str] = {}
    event_to_raw_log_id: Dict[int, int] = {}
    investigation_meta: Optional[InvestigationTimelineMeta] = None

    stmt = select(EventModel).options(selectinload(EventModel.host))

    # 1. INVESTIGATION CONTEXT
    if investigation_id is not None:
        inv_check = await db.execute(
            select(InvestigationModel).where(InvestigationModel.id == investigation_id)
        )
        inv_obj = inv_check.scalars().first()
        if not inv_obj:
            raise HTTPException(status_code=404, detail="Investigation not found")

        ev_res = await db.execute(
            select(InvestigationEvidence).where(InvestigationEvidence.investigation_id == investigation_id)
        )
        evidence_items = ev_res.scalars().all()
        if not evidence_items:
            return TimelineResponse(
                items=[],
                page=page,
                page_size=page_size,
                total=0,
                investigation_info=InvestigationTimelineMeta(
                    id=inv_obj.id,
                    title=inv_obj.title,
                    status=inv_obj.status,
                    severity=inv_obj.severity,
                    time_range_start=None,
                    time_range_end=None,
                    evidence_count=0,
                    correlated_count=0
                )
            )

        context_timestamps: List[datetime] = []

        for e in evidence_items:
            ref = e.reference_id
            if e.evidence_type == "EVENT":
                if ref.isdigit():
                    direct_event_ids.add(int(ref))
                else:
                    sub = await db.execute(select(EventModel.id).where(EventModel.event_id == ref))
                    found_id = sub.scalar_one_or_none()
                    if found_id:
                        direct_event_ids.add(found_id)
            elif e.evidence_type == "ALERT":
                alert_q = select(AlertModel).where(
                    AlertModel.id == int(ref) if ref.isdigit() else AlertModel.alert_id == ref
                )
                a_res = await db.execute(alert_q)
                a_obj = a_res.scalars().first()
                if a_obj:
                    if a_obj.agent_id:
                        context_agent_ids.add(a_obj.agent_id)
                    if a_obj.first_seen:
                        context_timestamps.append(a_obj.first_seen)
                    if a_obj.last_seen:
                        context_timestamps.append(a_obj.last_seen)
                    trig_q = select(DetectionResult.event_id).where(DetectionResult.alert_id == a_obj.id)
                    trig_res = await db.execute(trig_q)
                    for eid in trig_res.scalars().all():
                        direct_event_ids.add(eid)
                        event_to_alert_id[eid] = str(a_obj.id)
            elif e.evidence_type == "RAW_LOG" and ref.isdigit():
                raw_q = select(EventModel.id).where(EventModel.raw_log_id == int(ref))
                raw_res = await db.execute(raw_q)
                for eid in raw_res.scalars().all():
                    direct_event_ids.add(eid)
                    event_to_raw_log_id[eid] = int(ref)
            elif e.evidence_type == "HOST" and ref.isdigit():
                h_res = await db.execute(select(HostModel).where(HostModel.id == int(ref)))
                h_obj = h_res.scalars().first()
                if h_obj:
                    if h_obj.hostname:
                        context_hostnames.add(h_obj.hostname)
                    if h_obj.ip_address:
                        context_ips.add(h_obj.ip_address)
                    if h_obj.last_seen:
                        context_timestamps.append(h_obj.last_seen)
            elif e.evidence_type == "AGENT" and ref.isdigit():
                ag_res = await db.execute(select(AgentModel).where(AgentModel.id == int(ref)))
                ag_obj = ag_res.scalars().first()
                if ag_obj:
                    context_agent_ids.add(ag_obj.id)
                    if ag_obj.hostname:
                        context_hostnames.add(ag_obj.hostname)
                    if ag_obj.ip_address:
                        context_ips.add(ag_obj.ip_address)
                    if ag_obj.last_seen:
                        context_timestamps.append(ag_obj.last_seen)

        # Inspect direct events to extract context keys and timestamps
        if direct_event_ids:
            dir_events_res = await db.execute(
                select(EventModel)
                .outerjoin(HostModel, EventModel.host_id == HostModel.id)
                .options(selectinload(EventModel.host))
                .where(EventModel.id.in_(list(direct_event_ids)))
            )
            for dev in dir_events_res.scalars().all():
                h_name = dev.hostname or (dev.host.hostname if dev.host else None)
                if h_name:
                    context_hostnames.add(h_name)
                if dev.agent_id:
                    context_agent_ids.add(dev.agent_id)
                if dev.source_ip:
                    context_ips.add(dev.source_ip)
                if dev.destination_ip:
                    context_ips.add(dev.destination_ip)
                if dev.username:
                    context_users.add(dev.username)
                if dev.timestamp:
                    context_timestamps.append(dev.timestamp)

        # Time range determination
        if context_timestamps:
            window_min = min(context_timestamps) - timedelta(minutes=time_window_minutes)
            window_max = max(context_timestamps) + timedelta(minutes=time_window_minutes)
        else:
            window_min = datetime.utcnow() - timedelta(minutes=time_window_minutes)
            window_max = datetime.utcnow() + timedelta(minutes=time_window_minutes)

        time_range_start = start_time or window_min
        time_range_end = end_time or window_max

        # Direct condition
        direct_cond = EventModel.id.in_(list(direct_event_ids)) if direct_event_ids else None

        # Correlated conditions (strictly excluding direct events to guarantee duplicate prevention)
        correlated_conditions = []
        if context_hostnames:
            correlated_conditions.append(
                or_(
                    EventModel.hostname.in_(list(context_hostnames)),
                    EventModel.host.has(HostModel.hostname.in_(list(context_hostnames)))
                )
            )
        if context_agent_ids:
            correlated_conditions.append(EventModel.agent_id.in_(list(context_agent_ids)))
        if context_ips:
            correlated_conditions.append(EventModel.source_ip.in_(list(context_ips)))
            correlated_conditions.append(EventModel.destination_ip.in_(list(context_ips)))
        if context_users:
            correlated_conditions.append(EventModel.username.in_(list(context_users)))

        time_bound = and_(EventModel.timestamp >= time_range_start, EventModel.timestamp <= time_range_end)

        correlated_cond = None
        if correlated_conditions:
            base_corr = and_(time_bound, or_(*correlated_conditions))
            if direct_event_ids:
                correlated_cond = and_(EventModel.id.notin_(list(direct_event_ids)), base_corr)
            else:
                correlated_cond = base_corr

        # Count direct vs correlated total
        direct_count = len(direct_event_ids)
        correlated_count = 0
        if correlated_cond is not None:
            c_count_res = await db.execute(select(func.count(EventModel.id)).where(correlated_cond))
            correlated_count = c_count_res.scalar_one()

        investigation_meta = InvestigationTimelineMeta(
            id=inv_obj.id,
            title=inv_obj.title,
            status=inv_obj.status,
            severity=inv_obj.severity,
            time_range_start=time_range_start,
            time_range_end=time_range_end,
            evidence_count=direct_count,
            correlated_count=correlated_count
        )

        # Apply provenance filter
        prov_norm = (provenance or "").upper()
        if prov_norm == "DIRECT_EVIDENCE":
            if direct_cond is not None:
                stmt = stmt.where(direct_cond)
            else:
                return TimelineResponse(
                    items=[], page=page, page_size=page_size, total=0,
                    investigation_info=investigation_meta
                )
        elif prov_norm in ["CORRELATED_EVENT", "CORRELATED_CONTEXT"]:
            if correlated_cond is not None:
                stmt = stmt.where(correlated_cond)
            else:
                return TimelineResponse(
                    items=[], page=page, page_size=page_size, total=0,
                    investigation_info=investigation_meta
                )
        else:
            # Both direct and correlated
            inv_branches = []
            if direct_cond is not None:
                inv_branches.append(direct_cond)
            if correlated_cond is not None:
                inv_branches.append(correlated_cond)
            if inv_branches:
                stmt = stmt.where(or_(*inv_branches))
            else:
                return TimelineResponse(
                    items=[], page=page, page_size=page_size, total=0,
                    investigation_info=investigation_meta
                )

    # 2. ALERT CONTEXT
    elif alert_id is not None:
        alert_q = select(AlertModel).options(selectinload(AlertModel.host)).where(
            AlertModel.id == int(alert_id) if alert_id.isdigit() else AlertModel.alert_id == alert_id
        )
        a_res = await db.execute(alert_q)
        alert_obj = a_res.scalars().first()
        if not alert_obj:
            raise HTTPException(status_code=404, detail="Alert not found")

        trig_q = select(DetectionResult.event_id).where(DetectionResult.alert_id == alert_obj.id)
        trig_res = await db.execute(trig_q)
        alert_trigger_event_ids = set(trig_res.scalars().all())

        ref_time = alert_obj.last_seen or alert_obj.first_seen or datetime.utcnow()
        surr_start = start_time or (ref_time - timedelta(minutes=time_window_minutes))
        surr_end = end_time or (ref_time + timedelta(minutes=time_window_minutes))

        surrounding_conds = []
        if alert_obj.host_id:
            surrounding_conds.append(EventModel.host_id == alert_obj.host_id)
        if alert_obj.agent_id:
            surrounding_conds.append(EventModel.agent_id == alert_obj.agent_id)

        trigger_cond = EventModel.id.in_(list(alert_trigger_event_ids)) if alert_trigger_event_ids else None

        surrounding_cond = None
        if surrounding_conds:
            base_surr = and_(
                EventModel.timestamp >= surr_start,
                EventModel.timestamp <= surr_end,
                or_(*surrounding_conds)
            )
            if alert_trigger_event_ids:
                surrounding_cond = and_(EventModel.id.notin_(list(alert_trigger_event_ids)), base_surr)
            else:
                surrounding_cond = base_surr

        prov_norm = (provenance or "").upper()
        if prov_norm in ["DIRECT_EVIDENCE", "ALERT_TRIGGER", "ALERT_CONTEXT"]:
            if trigger_cond is not None:
                stmt = stmt.where(trigger_cond)
            else:
                return TimelineResponse(items=[], page=page, page_size=page_size, total=0)
        elif prov_norm in ["CORRELATED_EVENT", "CORRELATED_CONTEXT", "SURROUNDING_CONTEXT"]:
            if surrounding_cond is not None:
                stmt = stmt.where(surrounding_cond)
            else:
                return TimelineResponse(items=[], page=page, page_size=page_size, total=0)
        else:
            alert_branches = []
            if trigger_cond is not None:
                alert_branches.append(trigger_cond)
            if surrounding_cond is not None:
                alert_branches.append(surrounding_cond)
            if alert_branches:
                stmt = stmt.where(or_(*alert_branches))
            else:
                return TimelineResponse(items=[], page=page, page_size=page_size, total=0)

    # 3. STANDARD USER FILTERS
    if hostname:
        stmt = stmt.where(
            or_(
                EventModel.hostname.ilike(f"%{hostname}%"),
                EventModel.host.has(HostModel.hostname.ilike(f"%{hostname}%"))
            )
        )
    if agent_id is not None:
        stmt = stmt.where(EventModel.agent_id == agent_id)
    if username:
        stmt = stmt.where(EventModel.username.ilike(f"%{username}%"))
    if source_ip:
        stmt = stmt.where(EventModel.source_ip == source_ip)
    if destination_ip:
        stmt = stmt.where(EventModel.destination_ip == destination_ip)
    if event_type:
        stmt = stmt.where(EventModel.event_type == event_type)
    if event_category:
        stmt = stmt.where(EventModel.event_category == event_category)
    if severity:
        stmt = stmt.where(EventModel.severity == severity)
    if start_time and investigation_id is None and alert_id is None:
        stmt = stmt.where(EventModel.timestamp >= start_time)
    if end_time and investigation_id is None and alert_id is None:
        stmt = stmt.where(EventModel.timestamp <= end_time)

    if search:
        search_term = f"%{search}%"
        stmt = stmt.where(or_(
            EventModel.username.ilike(search_term),
            EventModel.hostname.ilike(search_term),
            EventModel.host.has(HostModel.hostname.ilike(search_term)),
            EventModel.event_type.ilike(search_term),
            EventModel.source_type.ilike(search_term),
            EventModel.event_id.ilike(search_term),
            EventModel.source_ip.ilike(search_term),
            EventModel.destination_ip.ilike(search_term)
        ))

    # Total Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Ordering & Pagination
    if order == "asc":
        stmt = stmt.order_by(EventModel.timestamp.asc(), EventModel.id.asc())
    else:
        stmt = stmt.order_by(EventModel.timestamp.desc(), EventModel.id.desc())

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    events_res = await db.execute(stmt)
    events = events_res.scalars().all()

    # Query alert markers for events on this page
    event_ids_on_page = [ev.id for ev in events]
    event_alerts_map: Dict[int, Dict[str, Any]] = {}
    if event_ids_on_page:
        dr_stmt = (
            select(DetectionResult.event_id, AlertModel.id, AlertModel.title, AlertModel.severity)
            .join(AlertModel, DetectionResult.alert_id == AlertModel.id)
            .where(DetectionResult.event_id.in_(event_ids_on_page))
        )
        dr_res = await db.execute(dr_stmt)
        for eid, aid, atitle, asev in dr_res.all():
            event_alerts_map[eid] = {
                "alert_id": str(aid),
                "alert_title": atitle,
                "alert_severity": asev
            }

    # Batch-resolve investigation relationships for events on this page
    event_inv_map: Dict[int, Dict[str, Any]] = {}
    if event_ids_on_page:
        str_ids = [str(eid) for eid in event_ids_on_page]
        ev_str_eids = [ev.event_id for ev in events if ev.event_id]
        all_refs = list(set(str_ids + ev_str_eids))

        # Check direct event evidence
        inv_ev_stmt = (
            select(
                InvestigationEvidence.reference_id,
                InvestigationModel.id,
                InvestigationModel.title,
                InvestigationModel.status
            )
            .join(InvestigationModel, InvestigationEvidence.investigation_id == InvestigationModel.id)
            .where(
                InvestigationEvidence.evidence_type == "EVENT",
                InvestigationEvidence.reference_id.in_(all_refs)
            )
        )
        inv_ev_res = await db.execute(inv_ev_stmt)
        for ref_id, i_id, i_title, i_status in inv_ev_res.all():
            for ev in events:
                if str(ev.id) == ref_id or ev.event_id == ref_id:
                    event_inv_map[ev.id] = {
                        "investigation_id": i_id,
                        "investigation_title": i_title,
                        "investigation_status": i_status
                    }

        # Check if an associated alert is attached to an investigation
        alert_ids_on_page = [
            info["alert_id"] for info in event_alerts_map.values() if info.get("alert_id")
        ]
        if alert_ids_on_page:
            inv_al_stmt = (
                select(
                    InvestigationEvidence.reference_id,
                    InvestigationModel.id,
                    InvestigationModel.title,
                    InvestigationModel.status
                )
                .join(InvestigationModel, InvestigationEvidence.investigation_id == InvestigationModel.id)
                .where(
                    InvestigationEvidence.evidence_type == "ALERT",
                    InvestigationEvidence.reference_id.in_(alert_ids_on_page)
                )
            )
            inv_al_res = await db.execute(inv_al_stmt)
            for ref_id, i_id, i_title, i_status in inv_al_res.all():
                for ev_id, a_info in event_alerts_map.items():
                    if a_info.get("alert_id") == ref_id and ev_id not in event_inv_map:
                        event_inv_map[ev_id] = {
                            "investigation_id": i_id,
                            "investigation_title": i_title,
                            "investigation_status": i_status
                        }

    items: List[TimelineItem] = []
    for ev in events:
        c_provenance: Optional[str] = None
        c_type: Optional[str] = None
        c_reason: Optional[str] = None
        alert_info = event_alerts_map.get(ev.id, {})
        item_alert_id = event_to_alert_id.get(ev.id) or alert_info.get("alert_id")
        item_alert_title = alert_info.get("alert_title")
        item_alert_severity = alert_info.get("alert_severity")
        item_raw_log_id = event_to_raw_log_id.get(ev.id) or ev.raw_log_id

        # Resolve investigation for item
        item_inv_id = None
        item_inv_title = None
        item_inv_status = None
        item_related_count = None

        if investigation_id is not None:
            item_inv_id = inv_obj.id
            item_inv_title = inv_obj.title
            item_inv_status = inv_obj.status
            if ev.id in direct_event_ids and investigation_meta:
                item_related_count = investigation_meta.correlated_count

            # Check matching context keys
            reasons = []
            ev_h = ev.hostname or (ev.host.hostname if ev.host else None)
            if ev_h and ev_h in context_hostnames:
                reasons.append("Same host")
            if ev.agent_id and ev.agent_id in context_agent_ids:
                reasons.append("Same agent")
            if ev.source_ip and ev.source_ip in context_ips:
                reasons.append("Same source IP")
            if ev.destination_ip and ev.destination_ip in context_ips:
                reasons.append("Same destination IP")
            if ev.username and ev.username in context_users:
                reasons.append("Same username")

            if ev.id in direct_event_ids:
                c_provenance = "DIRECT_EVIDENCE"
                c_type = "DIRECT_EVIDENCE"
                if reasons:
                    c_reason = "Direct evidence (also: " + " + ".join(reasons) + ")"
                else:
                    c_reason = "Direct evidence"
            else:
                c_provenance = "CORRELATED_EVENT"
                c_type = "CORRELATED_EVENT"
                c_reason = " + ".join(reasons) if reasons else "Correlated event"
        elif alert_id is not None:
            if ev.id in alert_trigger_event_ids:
                c_provenance = "ALERT_CONTEXT"
                c_type = "ALERT_TRIGGER"
                c_reason = f"Triggering event for alert #{alert_id}"
                item_alert_id = str(alert_id)
            else:
                c_provenance = "CORRELATED_EVENT"
                c_type = "SURROUNDING_CONTEXT"
                c_reason = f"Surrounding host/agent activity"
                item_alert_id = str(alert_id)

            if ev.id in event_inv_map:
                inv_data = event_inv_map[ev.id]
                item_inv_id = inv_data["investigation_id"]
                item_inv_title = inv_data["investigation_title"]
                item_inv_status = inv_data["investigation_status"]
        else:
            if ev.id in event_inv_map:
                inv_data = event_inv_map[ev.id]
                item_inv_id = inv_data["investigation_id"]
                item_inv_title = inv_data["investigation_title"]
                item_inv_status = inv_data["investigation_status"]

            c_provenance = "OTHER"
            c_type = "OTHER"
            c_reason = None

        items.append(
            _extract_timeline_item(
                ev,
                provenance=c_provenance,
                context_type=c_type,
                context_reason=c_reason,
                alert_id=item_alert_id,
                alert_title=item_alert_title,
                alert_severity=item_alert_severity,
                investigation_id=item_inv_id,
                investigation_title=item_inv_title,
                investigation_status=item_inv_status,
                related_event_count=item_related_count
            )
        )

    # Compute timeline summary metrics
    unique_hosts = sorted(list({ev.hostname or (ev.host.hostname if ev.host else None) for ev in events if (ev.hostname or (ev.host and ev.host.hostname))}))
    unique_agents = sorted(list({ev.agent_id for ev in events if ev.agent_id is not None}))
    unique_users = sorted(list({ev.username for ev in events if ev.username}))
    unique_source_ips = sorted(list({ev.source_ip for ev in events if ev.source_ip}))
    unique_destination_ips = sorted(list({ev.destination_ip for ev in events if ev.destination_ip}))

    summary_metrics = TimelineSummaryMetrics(
        total_events=total,
        direct_evidence_count=investigation_meta.evidence_count if investigation_meta else len([e for e in items if e.provenance == "DIRECT_EVIDENCE"]),
        correlated_count=investigation_meta.correlated_count if investigation_meta else len([e for e in items if e.provenance == "CORRELATED_EVENT"]),
        alerts_count=len(event_alerts_map) or (1 if alert_id else 0),
        unique_hosts=unique_hosts,
        unique_agents=unique_agents,
        unique_users=unique_users,
        unique_source_ips=unique_source_ips,
        unique_destination_ips=unique_destination_ips
    )

    return TimelineResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        investigation_info=investigation_meta,
        summary=summary_metrics
    )
