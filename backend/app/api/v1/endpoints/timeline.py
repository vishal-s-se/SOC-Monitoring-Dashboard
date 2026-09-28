from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_, distinct
from sqlalchemy.orm import selectinload
from typing import Optional, List, Set, Dict, Any
from datetime import datetime, timedelta

from backend.app.db.session import get_db
from backend.app.models.event import Event as EventModel
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.detection import DetectionResult, DetectionRule as DetectionRuleModel
from backend.app.models.investigation import Investigation as InvestigationModel, InvestigationEvidence
from backend.app.models.raw_log import RawLog as RawLogModel
from backend.app.models.host import Host as HostModel
from backend.app.models.agent import Agent as AgentModel
from backend.app.models.mitre import (
    MitreMapping as MitreMappingModel,
    MitreTechnique as MitreTechniqueModel,
    MitreTactic as MitreTacticModel,
    MitreTechniqueTactic as MitreTechniqueTacticModel,
    MitreMappingSource,
    MitreConfidence,
    MitreTargetType
)
from backend.app.schemas.mitre import MITRE_TECHNIQUE_ID_REGEX, MITRE_TACTIC_ID_REGEX
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
    related_event_ids: Optional[List[int]] = None,
    mitre_techniques: Optional[List[Dict[str, Any]]] = None
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
        mitre_techniques=mitre_techniques,
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
    source_port: Optional[int] = None,
    destination_port: Optional[int] = None,
    protocol: Optional[str] = None,
    event_type: Optional[str] = None,
    event_category: Optional[str] = None,
    severity: Optional[str] = None,
    investigation_id: Optional[int] = None,
    alert_id: Optional[str] = None,
    provenance: Optional[str] = Query(None, description="Filter: DIRECT_EVIDENCE, CORRELATED_EVENT, ALERT_CONTEXT"),
    time_window_minutes: int = Query(15, ge=1, le=1440),
    search: Optional[str] = None,
    order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    mitre_only: bool = Query(False, description="Filter only events with explicit or inherited MITRE ATT&CK mappings"),
    technique_id: Optional[str] = Query(None, description="Filter by exact MITRE technique ID (e.g. T1059)"),
    tactic_id: Optional[str] = Query(None, description="Filter by MITRE tactic ID (e.g. TA0002)"),
    subtechnique_id: Optional[str] = Query(None, description="Filter by subtechnique ID (e.g. T1059.001)"),
    mitre_source: Optional[str] = Query(None, description="Filter by mapping source"),
    mitre_confidence: Optional[str] = Query(None, description="Filter by confidence: LOW, MEDIUM, HIGH"),
    db: AsyncSession = Depends(get_db)
):
    if start_time and end_time:
        if end_time < start_time:
            raise HTTPException(status_code=400, detail="end_time must be after start_time")
        s = start_time.replace(tzinfo=None) if start_time.tzinfo else start_time
        e = end_time.replace(tzinfo=None) if end_time.tzinfo else end_time
        if (e - s) > timedelta(days=90):
            raise HTTPException(status_code=400, detail="Time range cannot exceed 90 days")

    # Validate MITRE technique / tactic / subtechnique formats if supplied
    tech_filter = subtechnique_id or technique_id
    if tech_filter:
        tech_filter = tech_filter.strip().upper()
        if not MITRE_TECHNIQUE_ID_REGEX.match(tech_filter):
            raise HTTPException(status_code=400, detail=f"Invalid MITRE technique ID format: '{tech_filter}'")
        # Ensure technique exists in catalog
        tech_exists = await db.execute(select(MitreTechniqueModel.technique_id).where(MitreTechniqueModel.technique_id == tech_filter))
        if not tech_exists.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"MITRE technique '{tech_filter}' not found in catalog")

    if tactic_id:
        tactic_id = tactic_id.strip().upper()
        if not MITRE_TACTIC_ID_REGEX.match(tactic_id):
            raise HTTPException(status_code=400, detail=f"Invalid MITRE tactic ID format: '{tactic_id}'")
        tac_exists = await db.execute(select(MitreTacticModel.tactic_id).where(MitreTacticModel.tactic_id == tactic_id))
        if not tac_exists.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"MITRE tactic '{tactic_id}' not found in catalog")

    if mitre_source:
        valid_sources = {s.value for s in MitreMappingSource}
        if mitre_source.upper() not in valid_sources:
            raise HTTPException(status_code=400, detail=f"Invalid mapping source: '{mitre_source}'")

    if mitre_confidence:
        valid_conf = {c.value for c in MitreConfidence}
        if mitre_confidence.upper() not in valid_conf:
            raise HTTPException(status_code=400, detail=f"Invalid confidence: '{mitre_confidence}'")

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
                ),
                summary=TimelineSummaryMetrics()
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
                    investigation_info=investigation_meta,
                    summary=TimelineSummaryMetrics()
                )
        elif prov_norm in ["CORRELATED_EVENT", "CORRELATED_CONTEXT"]:
            if correlated_cond is not None:
                stmt = stmt.where(correlated_cond)
            else:
                return TimelineResponse(
                    items=[], page=page, page_size=page_size, total=0,
                    investigation_info=investigation_meta,
                    summary=TimelineSummaryMetrics()
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
                    investigation_info=investigation_meta,
                    summary=TimelineSummaryMetrics()
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
                return TimelineResponse(items=[], page=page, page_size=page_size, total=0, summary=TimelineSummaryMetrics())
        elif prov_norm in ["CORRELATED_EVENT", "CORRELATED_CONTEXT", "SURROUNDING_CONTEXT"]:
            if surrounding_cond is not None:
                stmt = stmt.where(surrounding_cond)
            else:
                return TimelineResponse(items=[], page=page, page_size=page_size, total=0, summary=TimelineSummaryMetrics())
        else:
            alert_branches = []
            if trigger_cond is not None:
                alert_branches.append(trigger_cond)
            if surrounding_cond is not None:
                alert_branches.append(surrounding_cond)
            if alert_branches:
                stmt = stmt.where(or_(*alert_branches))
            else:
                return TimelineResponse(items=[], page=page, page_size=page_size, total=0, summary=TimelineSummaryMetrics())

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
    if source_port is not None:
        stmt = stmt.where(EventModel.source_port == source_port)
    if destination_port is not None:
        stmt = stmt.where(EventModel.destination_port == destination_port)
    if protocol:
        stmt = stmt.where(EventModel.protocol.ilike(protocol))
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

    # 4. MITRE ATT&CK FILTERING (Phase 7E-4)
    # Filter by mitre_only, technique_id, tactic_id, subtechnique_id, mitre_source, mitre_confidence
    if mitre_only or tech_filter or tactic_id or mitre_source or mitre_confidence:
        # Build conditions on MitreMappingModel
        mapping_conditions = []
        if tech_filter:
            mapping_conditions.append(MitreMappingModel.technique_id == tech_filter)
        if tactic_id:
            # Technique linked to tactic
            sub_tactic_techs = select(MitreTechniqueTacticModel.technique_id).where(MitreTechniqueTacticModel.tactic_id == tactic_id)
            mapping_conditions.append(MitreMappingModel.technique_id.in_(sub_tactic_techs))
        if mitre_source:
            mapping_conditions.append(MitreMappingModel.mapping_source == mitre_source.upper())
        if mitre_confidence:
            mapping_conditions.append(MitreConfidence[mitre_confidence.upper()].value if mitre_confidence.upper() in MitreConfidence.__members__ else MitreMappingModel.confidence == mitre_confidence.upper())

        map_filter = and_(*mapping_conditions) if mapping_conditions else True

        # Candidate events:
        # A. Direct Event mappings (target_type == 'EVENT')
        ev_maps_q = select(MitreMappingModel.target_id).where(
            MitreMappingModel.target_type == "EVENT",
            map_filter
        )
        ev_maps_res = await db.execute(ev_maps_q)
        target_ids = ev_maps_res.scalars().all()
        matching_event_ids: Set[int] = set()
        for tid in target_ids:
            if tid.isdigit():
                matching_event_ids.add(int(tid))
            else:
                # Target ID could be string event_id (UUID-style)
                str_eid_q = select(EventModel.id).where(EventModel.event_id == tid)
                eid_res = await db.execute(str_eid_q)
                for eid_found in eid_res.scalars().all():
                    matching_event_ids.add(eid_found)

        # B. Alert mappings (target_type == 'ALERT') -> triggers event_id via DetectionResult
        al_maps_q = select(MitreMappingModel.target_id).where(
            MitreMappingModel.target_type == "ALERT",
            map_filter
        )
        al_maps_res = await db.execute(al_maps_q)
        al_target_ids = al_maps_res.scalars().all()
        if al_target_ids:
            num_al_ids = [int(a) for a in al_target_ids if a.isdigit()]
            str_al_ids = [a for a in al_target_ids if not a.isdigit()]
            al_id_conds = []
            if num_al_ids:
                al_id_conds.append(AlertModel.id.in_(num_al_ids))
            if str_al_ids:
                al_id_conds.append(AlertModel.alert_id.in_(str_al_ids))
            if al_id_conds:
                al_stmt = select(AlertModel.id).where(or_(*al_id_conds))
                found_alerts = (await db.execute(al_stmt)).scalars().all()
                if found_alerts:
                    al_dr_q = select(DetectionResult.event_id).where(DetectionResult.alert_id.in_(found_alerts))
                    for eid in (await db.execute(al_dr_q)).scalars().all():
                        matching_event_ids.add(eid)

        # C. Detection Rule mappings (target_type == 'DETECTION_RULE') -> alert -> DetectionResult -> event_id
        rule_maps_q = select(MitreMappingModel.target_id).where(
            MitreMappingModel.target_type == "DETECTION_RULE",
            map_filter
        )
        rule_maps_res = await db.execute(rule_maps_q)
        rule_target_ids = rule_maps_res.scalars().all()
        if rule_target_ids:
            num_r_ids = [int(r) for r in rule_target_ids if r.isdigit()]
            r_alerts_conds = []
            if num_r_ids:
                r_alerts_conds.append(AlertModel.rule_id.in_(num_r_ids))
            # Also check detection rules matched by rule_id string if any
            if r_alerts_conds:
                r_alerts_q = select(AlertModel.id).where(or_(*r_alerts_conds))
                r_alert_ids = (await db.execute(r_alerts_q)).scalars().all()
                if r_alert_ids:
                    r_dr_q = select(DetectionResult.event_id).where(DetectionResult.alert_id.in_(r_alert_ids))
                    for eid in (await db.execute(r_dr_q)).scalars().all():
                        matching_event_ids.add(eid)

        if matching_event_ids:
            stmt = stmt.where(EventModel.id.in_(list(matching_event_ids)))
        else:
            # No events match the requested MITRE criteria
            return TimelineResponse(
                items=[],
                page=page,
                page_size=page_size,
                total=0,
                investigation_info=investigation_meta,
                summary=TimelineSummaryMetrics(
                    total_events=0,
                    direct_evidence_count=0,
                    correlated_count=0,
                    alerts_count=0
                )
            )

    # 5. SEARCH (Extended for MITRE technique ID, name, tactic name in Phase 7E-4)
    if search:
        search_term = f"%{search.strip()}%"
        # Find any technique IDs or names matching search
        matching_tech_q = select(MitreTechniqueModel.technique_id).where(
            or_(
                MitreTechniqueModel.technique_id.ilike(search_term),
                MitreTechniqueModel.name.ilike(search_term)
            )
        )
        matching_tech_ids = (await db.execute(matching_tech_q)).scalars().all()

        matching_tactic_q = select(MitreTechniqueTacticModel.technique_id).join(
            MitreTacticModel, MitreTechniqueTacticModel.tactic_id == MitreTacticModel.tactic_id
        ).where(
            or_(
                MitreTacticModel.tactic_id.ilike(search_term),
                MitreTacticModel.name.ilike(search_term)
            )
        )
        matching_tactic_techs = (await db.execute(matching_tactic_q)).scalars().all()
        all_search_techs = list(set(matching_tech_ids + matching_tactic_techs))

        search_event_ids: Set[int] = set()
        if all_search_techs:
            s_map_q = select(MitreMappingModel.target_type, MitreMappingModel.target_id).where(
                MitreMappingModel.technique_id.in_(all_search_techs)
            )
            for m_type, m_id in (await db.execute(s_map_q)).all():
                if m_type == "EVENT":
                    if m_id.isdigit():
                        search_event_ids.add(int(m_id))
                    else:
                        for eid in (await db.execute(select(EventModel.id).where(EventModel.event_id == m_id))).scalars().all():
                            search_event_ids.add(eid)
                elif m_type == "ALERT":
                    a_id = int(m_id) if m_id.isdigit() else None
                    if a_id:
                        for eid in (await db.execute(select(DetectionResult.event_id).where(DetectionResult.alert_id == a_id))).scalars().all():
                            search_event_ids.add(eid)
                elif m_type == "DETECTION_RULE":
                    r_id = int(m_id) if m_id.isdigit() else None
                    if r_id:
                        al_ids = (await db.execute(select(AlertModel.id).where(AlertModel.rule_id == r_id))).scalars().all()
                        if al_ids:
                            for eid in (await db.execute(select(DetectionResult.event_id).where(DetectionResult.alert_id.in_(al_ids)))).scalars().all():
                                search_event_ids.add(eid)

        search_conds = [
            EventModel.username.ilike(search_term),
            EventModel.hostname.ilike(search_term),
            EventModel.host.has(HostModel.hostname.ilike(search_term)),
            EventModel.event_type.ilike(search_term),
            EventModel.event_category.ilike(search_term),
            EventModel.source_type.ilike(search_term),
            EventModel.event_id.ilike(search_term),
            EventModel.source_ip.ilike(search_term),
            EventModel.destination_ip.ilike(search_term)
        ]
        if search_event_ids:
            search_conds.append(EventModel.id.in_(list(search_event_ids)))

        stmt = stmt.where(or_(*search_conds))

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

    # Query alert markers for events on this page (including rule_id)
    event_ids_on_page = [ev.id for ev in events]
    event_alerts_map: Dict[int, Dict[str, Any]] = {}
    alert_rule_ids: Dict[int, int] = {}
    if event_ids_on_page:
        dr_stmt = (
            select(DetectionResult.event_id, AlertModel.id, AlertModel.title, AlertModel.severity, AlertModel.rule_id)
            .join(AlertModel, DetectionResult.alert_id == AlertModel.id)
            .where(DetectionResult.event_id.in_(event_ids_on_page))
        )
        dr_res = await db.execute(dr_stmt)
        for eid, aid, atitle, asev, arule_id in dr_res.all():
            event_alerts_map[eid] = {
                "alert_id": str(aid),
                "alert_title": atitle,
                "alert_severity": asev,
                "rule_id": arule_id
            }
            if arule_id:
                alert_rule_ids[aid] = arule_id

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

    # Batch-resolve MITRE ATT&CK technique mappings for events, associated alerts, or rules on this page
    event_mitre_map: Dict[int, List[Dict[str, Any]]] = {}
    if events:
        event_str_ids = [str(ev.id) for ev in events] + [ev.event_id for ev in events if ev.event_id]
        mitre_ev_stmt = (
            select(MitreMappingModel, MitreTechniqueModel)
            .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
            .options(
                selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic)
            )
            .where(
                MitreMappingModel.target_type == "EVENT",
                MitreMappingModel.target_id.in_(event_str_ids)
            )
        )
        mitre_ev_res = await db.execute(mitre_ev_stmt)
        for m_obj, t_obj in mitre_ev_res.all():
            tactics = [
                {"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name}
                for tt in t_obj.tactics if tt.tactic
            ]
            for ev in events:
                if str(ev.id) == m_obj.target_id or ev.event_id == m_obj.target_id:
                    if ev.id not in event_mitre_map:
                        event_mitre_map[ev.id] = []
                    event_mitre_map[ev.id].append({
                        "technique_id": t_obj.technique_id,
                        "name": t_obj.name,
                        "tactics": tactics,
                        "is_subtechnique": t_obj.is_subtechnique,
                        "parent_technique_id": t_obj.parent_technique_id,
                        "source": m_obj.mapping_source,
                        "confidence": m_obj.confidence,
                        "evidence_reference": m_obj.evidence_reference or f"Event #{ev.id}",
                        "relationship": "Event Direct Mapping"
                    })

        # Also check if any associated alert has an explicit MITRE mapping
        alert_str_ids = [info["alert_id"] for info in event_alerts_map.values() if info.get("alert_id")]
        if alert_str_ids:
            mitre_al_stmt = (
                select(MitreMappingModel, MitreTechniqueModel)
                .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
                .options(
                    selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic)
                )
                .where(
                    MitreMappingModel.target_type == "ALERT",
                    MitreMappingModel.target_id.in_(alert_str_ids)
                )
            )
            mitre_al_res = await db.execute(mitre_al_stmt)
            for m_obj, t_obj in mitre_al_res.all():
                tactics = [
                    {"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name}
                    for tt in t_obj.tactics if tt.tactic
                ]
                for ev_id, a_info in event_alerts_map.items():
                    if a_info.get("alert_id") == m_obj.target_id:
                        if ev_id not in event_mitre_map:
                            event_mitre_map[ev_id] = []
                        # Avoid duplicates
                        if not any(x["technique_id"] == t_obj.technique_id for x in event_mitre_map[ev_id]):
                            event_mitre_map[ev_id].append({
                                "technique_id": t_obj.technique_id,
                                "name": t_obj.name,
                                "tactics": tactics,
                                "is_subtechnique": t_obj.is_subtechnique,
                                "parent_technique_id": t_obj.parent_technique_id,
                                "source": m_obj.mapping_source,
                                "confidence": m_obj.confidence,
                                "evidence_reference": m_obj.evidence_reference or f"Alert #{m_obj.target_id}",
                                "relationship": "Alert Mapping"
                            })

        # Also check Detection Rule mappings for alerts on this page
        rule_ids_on_page = list(set([str(info["rule_id"]) for info in event_alerts_map.values() if info.get("rule_id")]))
        if rule_ids_on_page:
            mitre_rule_stmt = (
                select(MitreMappingModel, MitreTechniqueModel)
                .join(MitreTechniqueModel, MitreMappingModel.technique_id == MitreTechniqueModel.technique_id)
                .options(
                    selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic)
                )
                .where(
                    MitreMappingModel.target_type == "DETECTION_RULE",
                    MitreMappingModel.target_id.in_(rule_ids_on_page)
                )
            )
            mitre_rule_res = await db.execute(mitre_rule_stmt)
            for m_obj, t_obj in mitre_rule_res.all():
                tactics = [
                    {"tactic_id": tt.tactic.tactic_id, "name": tt.tactic.name}
                    for tt in t_obj.tactics if tt.tactic
                ]
                for ev_id, a_info in event_alerts_map.items():
                    if str(a_info.get("rule_id")) == m_obj.target_id:
                        if ev_id not in event_mitre_map:
                            event_mitre_map[ev_id] = []
                        if not any(x["technique_id"] == t_obj.technique_id for x in event_mitre_map[ev_id]):
                            event_mitre_map[ev_id].append({
                                "technique_id": t_obj.technique_id,
                                "name": t_obj.name,
                                "tactics": tactics,
                                "is_subtechnique": t_obj.is_subtechnique,
                                "parent_technique_id": t_obj.parent_technique_id,
                                "source": m_obj.mapping_source,
                                "confidence": m_obj.confidence,
                                "evidence_reference": m_obj.evidence_reference or f"Rule #{m_obj.target_id} (via Alert)",
                                "relationship": "Detection Rule Mapping"
                            })

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
                related_event_count=item_related_count,
                mitre_techniques=event_mitre_map.get(ev.id)
            )
        )

    # Compute timeline summary metrics including MITRE metrics
    unique_hosts = sorted(list({ev.hostname or (ev.host.hostname if ev.host else None) for ev in events if (ev.hostname or (ev.host and ev.host.hostname))}))
    unique_agents = sorted(list({ev.agent_id for ev in events if ev.agent_id is not None}))
    unique_users = sorted(list({ev.username for ev in events if ev.username}))
    unique_source_ips = sorted(list({ev.source_ip for ev in events if ev.source_ip}))
    unique_destination_ips = sorted(list({ev.destination_ip for ev in events if ev.destination_ip}))
    unique_categories = sorted(list({ev.event_category for ev in events if ev.event_category}))
    unique_types = sorted(list({ev.event_type for ev in events if ev.event_type}))

    # Count MITRE occurrences on page items
    events_with_mitre = [e for e in items if e.mitre_techniques]
    mitre_tech_set: Set[str] = set()
    mitre_tac_set: Set[str] = set()
    analyst_conf_cnt = 0
    doc_rule_cnt = 0

    for itm in events_with_mitre:
        for tech in (itm.mitre_techniques or []):
            mitre_tech_set.add(tech["technique_id"])
            if tech.get("source") == MitreMappingSource.ANALYST_CONFIRMED.value:
                analyst_conf_cnt += 1
            if tech.get("source") == MitreMappingSource.DOCUMENTED_RULE.value or tech.get("relationship") == "Detection Rule Mapping":
                doc_rule_cnt += 1
            for tac in (tech.get("tactics") or []):
                mitre_tac_set.add(tac["tactic_id"])

    summary_metrics = TimelineSummaryMetrics(
        total_events=total,
        direct_evidence_count=investigation_meta.evidence_count if investigation_meta else len([e for e in items if e.provenance == "DIRECT_EVIDENCE"]),
        correlated_count=investigation_meta.correlated_count if investigation_meta else len([e for e in items if e.provenance == "CORRELATED_EVENT"]),
        alerts_count=len(event_alerts_map) or (1 if alert_id else 0),
        unique_hosts=unique_hosts,
        unique_agents=unique_agents,
        unique_users=unique_users,
        unique_source_ips=unique_source_ips,
        unique_destination_ips=unique_destination_ips,
        unique_event_categories=unique_categories,
        unique_event_types=unique_types,
        mitre_events_count=len(events_with_mitre),
        mitre_techniques_count=len(mitre_tech_set),
        mitre_tactics_count=len(mitre_tac_set),
        analyst_confirmed_count=analyst_conf_cnt,
        documented_rules_count=doc_rule_cnt
    )

    return TimelineResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        investigation_info=investigation_meta,
        summary=summary_metrics
    )
