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
from backend.app.schemas.timeline import TimelineItem
from backend.app.schemas.pagination import PaginatedResponse

router = APIRouter()

def _extract_timeline_item(
    ev: EventModel,
    context_type: Optional[str] = None,
    context_reason: Optional[str] = None
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

    return TimelineItem(
        id=ev.id,
        event_id=ev.event_id,
        timestamp=ev.timestamp,
        received_at=ev.received_at,
        event_type=ev.event_type,
        event_category=ev.event_category,
        severity=ev.severity,
        hostname=ev.hostname,
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
        context_type=context_type,
        context_reason=context_reason,
        metadata_=ev.metadata_
    )


@router.get("/", response_model=PaginatedResponse[TimelineItem])
@router.get("", response_model=PaginatedResponse[TimelineItem], include_in_schema=False)
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

    stmt = select(EventModel)

    # 1. INVESTIGATION CONTEXT
    if investigation_id is not None:
        inv_check = await db.execute(
            select(InvestigationModel).where(InvestigationModel.id == investigation_id)
        )
        if not inv_check.scalars().first():
            raise HTTPException(status_code=404, detail="Investigation not found")

        ev_res = await db.execute(
            select(InvestigationEvidence).where(InvestigationEvidence.investigation_id == investigation_id)
        )
        evidence_items = ev_res.scalars().all()
        if not evidence_items:
            return PaginatedResponse(items=[], page=page, page_size=page_size, total=0)

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
            elif e.evidence_type == "RAW_LOG" and ref.isdigit():
                raw_q = select(EventModel.id).where(EventModel.raw_log_id == int(ref))
                raw_res = await db.execute(raw_q)
                for eid in raw_res.scalars().all():
                    direct_event_ids.add(eid)
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

        # Build investigation matching conditions
        inv_or_conditions = []
        if direct_event_ids:
            inv_or_conditions.append(EventModel.id.in_(list(direct_event_ids)))

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

        if correlated_conditions and context_timestamps:
            min_ts = min(context_timestamps) - timedelta(minutes=60)
            max_ts = max(context_timestamps) + timedelta(minutes=60)
            time_bound = and_(EventModel.timestamp >= min_ts, EventModel.timestamp <= max_ts)
            inv_or_conditions.append(and_(time_bound, or_(*correlated_conditions)))

        if inv_or_conditions:
            stmt = stmt.where(or_(*inv_or_conditions))
        elif direct_event_ids:
            stmt = stmt.where(EventModel.id.in_(list(direct_event_ids)))
        else:
            return PaginatedResponse(items=[], page=page, page_size=page_size, total=0)

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

        alert_or_conditions = []
        if alert_trigger_event_ids:
            alert_or_conditions.append(EventModel.id.in_(list(alert_trigger_event_ids)))

        surrounding_conds = []
        if alert_obj.host_id:
            surrounding_conds.append(EventModel.host_id == alert_obj.host_id)
        if alert_obj.agent_id:
            surrounding_conds.append(EventModel.agent_id == alert_obj.agent_id)

        ref_time = alert_obj.last_seen or alert_obj.first_seen or datetime.utcnow()
        surr_start = ref_time - timedelta(minutes=30)
        surr_end = ref_time + timedelta(minutes=30)
        if surrounding_conds:
            alert_or_conditions.append(
                and_(
                    EventModel.timestamp >= surr_start,
                    EventModel.timestamp <= surr_end,
                    or_(*surrounding_conds)
                )
            )

        if alert_or_conditions:
            stmt = stmt.where(or_(*alert_or_conditions))
        else:
            return PaginatedResponse(items=[], page=page, page_size=page_size, total=0)

    # 3. STANDARD FILTERS
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
    if start_time:
        stmt = stmt.where(EventModel.timestamp >= start_time)
    if end_time:
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

    items: List[TimelineItem] = []
    for ev in events:
        c_type: Optional[str] = None
        c_reason: Optional[str] = None

        if investigation_id is not None:
            if ev.id in direct_event_ids:
                c_type = "DIRECT_EVIDENCE"
                c_reason = "Direct investigation evidence"
            else:
                c_type = "CORRELATED_CONTEXT"
                reasons = []
                if ev.hostname and ev.hostname in context_hostnames:
                    reasons.append(f"Same host ({ev.hostname})")
                if ev.agent_id and ev.agent_id in context_agent_ids:
                    reasons.append(f"Same agent ({ev.agent_id})")
                if ev.source_ip and ev.source_ip in context_ips:
                    reasons.append(f"Same IP ({ev.source_ip})")
                if ev.destination_ip and ev.destination_ip in context_ips:
                    reasons.append(f"Same IP ({ev.destination_ip})")
                if ev.username and ev.username in context_users:
                    reasons.append(f"Same user ({ev.username})")
                c_reason = " + ".join(reasons) if reasons else "Correlated activity"
        elif alert_id is not None:
            if ev.id in alert_trigger_event_ids:
                c_type = "ALERT_TRIGGER"
                c_reason = f"Triggering event for alert #{alert_id}"
            else:
                c_type = "SURROUNDING_CONTEXT"
                c_reason = f"Surrounding host/agent activity around alert #{alert_id}"

        items.append(_extract_timeline_item(ev, context_type=c_type, context_reason=c_reason))

    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )
