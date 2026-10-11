from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from typing import List, Optional

from backend.app.db.session import get_db
from backend.app.models.analytics import BehaviorBaseline, BehaviorDeviation, BehaviorDeviationEvidence
from backend.app.schemas.analytics import (
    BehaviorBaselineResponse, BehaviorDeviationResponse, BehaviorCorrelationResponse,
    MetricOverviewResponse, MetricTimeSeriesResponse, MetricTimeSeriesPoint,
    MetricDetectionsResponse, MetricRuleMatch
)
from backend.app.models.event import Event
from backend.app.models.alert import Alert
from backend.app.models.investigation import Investigation
from backend.app.models.detection import DetectionResult, DetectionRule
from datetime import datetime, timedelta, timezone


router = APIRouter()

@router.get("/baselines", response_model=List[BehaviorBaselineResponse])
async def get_baselines(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BehaviorBaseline)
    if entity_type:
        stmt = stmt.where(BehaviorBaseline.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(BehaviorBaseline.entity_id == entity_id)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/baselines/{baseline_id}", response_model=BehaviorBaselineResponse)
async def get_baseline_by_id(
    baseline_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(BehaviorBaseline).where(BehaviorBaseline.id == baseline_id))
    baseline = result.scalars().first()
    if not baseline:
        raise HTTPException(status_code=404, detail="Baseline not found")
    return baseline

@router.get("/deviations", response_model=List[BehaviorDeviationResponse])
async def get_deviations(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    metric_name: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.orm import selectinload
    stmt = select(BehaviorDeviation).options(selectinload(BehaviorDeviation.evidence))
    
    if entity_type:
        stmt = stmt.where(BehaviorDeviation.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(BehaviorDeviation.entity_id == entity_id)
    if metric_name:
        stmt = stmt.where(BehaviorDeviation.metric_name == metric_name)
        
    stmt = stmt.order_by(BehaviorDeviation.observation_timestamp.desc()).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/entities/{entity_type}/{entity_id}/deviations", response_model=List[BehaviorDeviationResponse])
async def get_entity_deviations(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.orm import selectinload
    stmt = select(BehaviorDeviation).options(selectinload(BehaviorDeviation.evidence))\
        .where(BehaviorDeviation.entity_type == entity_type)\
        .where(BehaviorDeviation.entity_id == entity_id)\
        .order_by(BehaviorDeviation.observation_timestamp.desc())
    
    result = await db.execute(stmt)
    return result.scalars().all()

from backend.app.models.analytics import BehaviorCorrelation
from backend.app.schemas.analytics import BehaviorCorrelationResponse

@router.get("/correlations", response_model=List[BehaviorCorrelationResponse])
async def get_correlations(
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    relationship_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BehaviorCorrelation)
    if related_entity_type:
        stmt = stmt.where(BehaviorCorrelation.related_entity_type == related_entity_type)
    if related_entity_id:
        stmt = stmt.where(BehaviorCorrelation.related_entity_id == related_entity_id)
    if relationship_type:
        stmt = stmt.where(BehaviorCorrelation.relationship_type == relationship_type)
        
    stmt = stmt.order_by(BehaviorCorrelation.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/deviations/{deviation_id}/correlations", response_model=List[BehaviorCorrelationResponse])
async def get_deviation_correlations(
    deviation_id: int,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BehaviorCorrelation).where(BehaviorCorrelation.deviation_id == deviation_id).order_by(BehaviorCorrelation.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()



@router.get("/overview", response_model=MetricOverviewResponse)
async def get_analytics_overview(
    hours: int = 24,
    operating_system: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    event_stmt = select(func.count(Event.id)).where(Event.timestamp >= start_time)
    if operating_system:
        event_stmt = event_stmt.where(Event.operating_system.ilike(f"%{operating_system}%"))
    events_res = await db.execute(event_stmt)
    events_count = events_res.scalar() or 0
    
    if operating_system:
        alert_open_stmt = select(func.count(Alert.id)).outerjoin(Agent, Alert.agent_id == Agent.id).where(
            Alert.status == 'OPEN',
            Alert.first_seen >= start_time,
            Agent.operating_system.ilike(f"%{operating_system}%")
        )
        alert_res_stmt = select(func.count(Alert.id)).outerjoin(Agent, Alert.agent_id == Agent.id).where(
            Alert.status == 'RESOLVED',
            Alert.first_seen >= start_time,
            Agent.operating_system.ilike(f"%{operating_system}%")
        )
    else:
        alert_open_stmt = select(func.count(Alert.id)).where(Alert.status == 'OPEN', Alert.first_seen >= start_time)
        alert_res_stmt = select(func.count(Alert.id)).where(Alert.status == 'RESOLVED', Alert.first_seen >= start_time)

    alerts_open_res = await db.execute(alert_open_stmt)
    alerts_open = alerts_open_res.scalar() or 0
    
    alerts_res_res = await db.execute(alert_res_stmt)
    alerts_resolved = alerts_res_res.scalar() or 0
    
    inv_res = await db.execute(select(func.count(Investigation.id)).where(Investigation.status != 'CLOSED', Investigation.created_at >= start_time))
    inv_active = inv_res.scalar() or 0
    
    dev_res = await db.execute(select(func.count(BehaviorDeviation.id)).where(BehaviorDeviation.observation_timestamp >= start_time))
    dev_count = dev_res.scalar() or 0
    
    return MetricOverviewResponse(
        time_range=f"last_{hours}h",
        events_received=events_count,
        total_events=events_count,
        alerts_open=alerts_open,
        open_alerts=alerts_open,
        alerts_resolved=alerts_resolved,
        investigations_active=inv_active,
        behavioral_deviations=dev_count,
        generated_at=now
    )

@router.get("/timeseries", response_model=MetricTimeSeriesResponse)
async def get_analytics_timeseries(
    metric: str = Query("events", description="events or alerts"),
    hours: int = 24,
    operating_system: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    if metric == "events":
        model = Event
        time_col = Event.timestamp
        stmt = select(
            func.date_trunc('hour', time_col).label('hour_bucket'),
            func.count(model.id).label('count')
        ).where(time_col >= start_time)
        if operating_system:
            stmt = stmt.where(Event.operating_system.ilike(f"%{operating_system}%"))
        stmt = stmt.group_by('hour_bucket').order_by('hour_bucket')
    else:
        model = Alert
        time_col = Alert.first_seen
        stmt = select(
            func.date_trunc('hour', time_col).label('hour_bucket'),
            func.count(model.id).label('count')
        )
        if operating_system:
            stmt = stmt.outerjoin(Agent, Alert.agent_id == Agent.id).where(Agent.operating_system.ilike(f"%{operating_system}%"))
        stmt = stmt.where(time_col >= start_time).group_by('hour_bucket').order_by('hour_bucket')
    
    result = await db.execute(stmt)
    rows = result.all()
    
    points = [MetricTimeSeriesPoint(timestamp=row.hour_bucket, count=row.count) for row in rows if row.hour_bucket]
    
    return MetricTimeSeriesResponse(
        metric_name=metric,
        interval="1h",
        data=points
    )

@router.get("/detections", response_model=MetricDetectionsResponse)
async def get_analytics_detections(
    hours: int = 24,
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    matches_res = await db.execute(select(func.count(DetectionResult.id)).where(DetectionResult.timestamp >= start_time))
    total_matches = matches_res.scalar() or 0
    
    stmt = select(
        DetectionRule.name,
        DetectionRule.severity,
        func.count(DetectionResult.id).label('match_count')
    ).select_from(DetectionResult).join(DetectionRule, DetectionResult.rule_id == DetectionRule.id)    .where(DetectionResult.timestamp >= start_time)    .group_by(DetectionRule.name, DetectionRule.severity)
    
    rules_res = await db.execute(stmt)
    
    rule_matches = [
        MetricRuleMatch(rule_name=row.name, severity=row.severity, match_count=row.match_count)
        for row in rules_res.all()
    ]
    
    return MetricDetectionsResponse(
        total_evaluations=0, # Optional, if we tracked raw evaluations
        total_matches=total_matches,
        rule_matches=rule_matches
    )

from backend.app.schemas.analytics import (
    MetricTelemetryResponse, MetricAlertsResponse,
    MetricInvestigationsResponse, MetricAgentHealthResponse, MetricMitreResponse,
    TabAnalyticsResponse, MetricDistributionItem
)
from backend.app.models.agent import Agent
from backend.app.models.mitre import MitreMapping, MitreTechnique, MitreTactic, MitreTechniqueTactic

@router.get("/telemetry", response_model=MetricTelemetryResponse)
async def get_analytics_telemetry(
    hours: int = 24,
    operating_system: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    base_filter = [Event.timestamp >= start_time]
    if operating_system:
        base_filter.append(Event.operating_system.ilike(f"%{operating_system}%"))

    total = (await db.execute(select(func.count(Event.id)).where(*base_filter))).scalar() or 0
    
    cat_res = await db.execute(
        select(Event.event_category, func.count(Event.id))
        .where(*base_filter)
        .group_by(Event.event_category)
    )
    by_category = {row[0] or "unknown": row[1] for row in cat_res.all()}
    
    sev_res = await db.execute(
        select(Event.severity, func.count(Event.id))
        .where(*base_filter)
        .group_by(Event.severity)
    )
    by_severity = {row[0] or "unknown": row[1] for row in sev_res.all()}
    
    os_res = await db.execute(
        select(Event.operating_system, func.count(Event.id))
        .where(*base_filter)
        .group_by(Event.operating_system)
    )
    by_os = {row[0] or "unknown": row[1] for row in os_res.all()}
    
    return MetricTelemetryResponse(total_events=total, by_category=by_category, by_severity=by_severity, by_os=by_os)

@router.get("/alerts", response_model=MetricAlertsResponse)
async def get_analytics_alerts(hours: int = 24, db: AsyncSession = Depends(get_db)):
    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    total = (await db.execute(select(func.count(Alert.id)).where(Alert.first_seen >= start_time))).scalar() or 0
    
    sev_res = await db.execute(select(Alert.severity, func.count(Alert.id)).where(Alert.first_seen >= start_time).group_by(Alert.severity))
    by_severity = {row[0] or "unknown": row[1] for row in sev_res.all()}
    
    status_res = await db.execute(select(Alert.status, func.count(Alert.id)).where(Alert.first_seen >= start_time).group_by(Alert.status))
    by_status = {row[0] or "unknown": row[1] for row in status_res.all()}
    
    return MetricAlertsResponse(total_alerts=total, by_severity=by_severity, by_status=by_status)

@router.get("/investigations", response_model=MetricInvestigationsResponse)
async def get_analytics_investigations(hours: int = 24, db: AsyncSession = Depends(get_db)):
    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    total = (await db.execute(select(func.count(Investigation.id)).where(Investigation.created_at >= start_time))).scalar() or 0
    
    sev_res = await db.execute(select(Investigation.severity, func.count(Investigation.id)).where(Investigation.created_at >= start_time).group_by(Investigation.severity))
    by_severity = {row[0] or "unknown": row[1] for row in sev_res.all()}
    
    status_res = await db.execute(select(Investigation.status, func.count(Investigation.id)).where(Investigation.created_at >= start_time).group_by(Investigation.status))
    by_status = {row[0] or "unknown": row[1] for row in status_res.all()}
    
    return MetricInvestigationsResponse(total_investigations=total, by_status=by_status, by_severity=by_severity)

@router.get("/agents", response_model=MetricAgentHealthResponse)
async def get_analytics_agents(
    operating_system: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    base_filter = [Agent.status != "RETIRED"]
    if operating_system:
        base_filter.append(Agent.operating_system.ilike(f"%{operating_system}%"))

    total = (await db.execute(select(func.count(Agent.id)).where(*base_filter))).scalar() or 0
    
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(minutes=5)
    
    online = (await db.execute(select(func.count(Agent.id)).where(*base_filter, Agent.last_heartbeat >= threshold))).scalar() or 0
    offline = max(0, total - online)
    
    return MetricAgentHealthResponse(total_agents=total, online_agents=online, offline_agents=offline)

@router.get("/mitre", response_model=MetricMitreResponse)
async def get_analytics_mitre(db: AsyncSession = Depends(get_db)):
    mapped_events = (await db.execute(select(func.count(MitreMapping.id)).where(MitreMapping.target_type == "EVENT"))).scalar() or 0
    mapped_alerts = (await db.execute(select(func.count(MitreMapping.id)).where(MitreMapping.target_type == "ALERT"))).scalar() or 0
    
    tactic_stmt = (
        select(MitreTactic.name, func.count(MitreMapping.id))
        .select_from(MitreMapping)
        .join(MitreTechnique, MitreMapping.technique_id == MitreTechnique.technique_id)
        .join(MitreTechniqueTactic, MitreTechnique.technique_id == MitreTechniqueTactic.technique_id)
        .join(MitreTactic, MitreTechniqueTactic.tactic_id == MitreTactic.tactic_id)
        .group_by(MitreTactic.name)
    )
    tactic_res = await db.execute(tactic_stmt)
    by_tactic = {row[0] or "unknown": row[1] for row in tactic_res.all()}
    
    return MetricMitreResponse(mapped_events=mapped_events, mapped_alerts=mapped_alerts, by_tactic=by_tactic)


@router.get("/tab-stats", response_model=TabAnalyticsResponse)
async def get_tab_analytics(
    tab: str = Query(..., description="Tab identifier: live-events, logs, authentication, network, firewall, processes, history, unified, hosts, alerts, investigations, mitre"),
    operating_system: Optional[str] = Query(None, description="Filter by OS e.g. windows, linux"),
    hours: int = Query(24, ge=1, le=8760, description="Hours window, default 24h"),
    agent_id: Optional[int] = Query(None, description="Optional agent id filter"),
    db: AsyncSession = Depends(get_db)
):
    """
    Dedicated high-performance aggregation endpoint providing genuine evidence-backed telemetry
    visualizations for each monitoring tab.
    """
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)

    base_filters = [Event.timestamp >= start_time]
    if operating_system:
        base_filters.append(Event.operating_system.ilike(f"%{operating_system}%"))
    if agent_id:
        base_filters.append(Event.agent_id == agent_id)

    timeseries_data: List[MetricTimeSeriesPoint] = []
    d1: List[MetricDistributionItem] = []
    d2: List[MetricDistributionItem] = []
    d3: Optional[List[MetricDistributionItem]] = None
    d4: Optional[List[MetricDistributionItem]] = None

    # Helper for timeseries
    async def get_event_timeseries(extra_filters=None):
        f = list(base_filters)
        if extra_filters:
            f.extend(extra_filters)
        stmt = (
            select(
                func.date_trunc('hour', Event.timestamp).label('hour_bucket'),
                func.count(Event.id).label('cnt')
            )
            .where(*f)
            .group_by('hour_bucket')
            .order_by('hour_bucket')
        )
        res = await db.execute(stmt)
        return [MetricTimeSeriesPoint(timestamp=row.hour_bucket, count=row.cnt) for row in res.all() if row.hour_bucket]

    # Specific tab aggregations
    if tab == "live-events":
        total_stmt = select(func.count(Event.id)).where(*base_filters)
        total = (await db.execute(total_stmt)).scalar() or 0
        timeseries_data = await get_event_timeseries()

        # d1: Severity distribution
        sev_res = await db.execute(
            select(func.coalesce(Event.severity, "UNKNOWN"), func.count(Event.id))
            .where(*base_filters).group_by(Event.severity)
        )
        d1 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in sev_res.all()]

        # d2: Channel / Provider / Source Type
        source_res = await db.execute(
            select(func.coalesce(Event.source_type, "unknown"), func.count(Event.id))
            .where(*base_filters).group_by(Event.source_type).order_by(func.count(Event.id).desc()).limit(10)
        )
        d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in source_res.all()]

        # d3: Category breakdown
        cat_res = await db.execute(
            select(func.coalesce(Event.event_category, "uncategorized"), func.count(Event.id))
            .where(*base_filters).group_by(Event.event_category).order_by(func.count(Event.id).desc()).limit(8)
        )
        d3 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in cat_res.all()]

    elif tab == "logs":
        total_stmt = select(func.count(Event.id)).where(*base_filters)
        total = (await db.execute(total_stmt)).scalar() or 0
        timeseries_data = await get_event_timeseries()

        # d1: Channel / Source Type distribution
        st_res = await db.execute(
            select(func.coalesce(Event.source_type, "unknown"), func.count(Event.id))
            .where(*base_filters).group_by(Event.source_type).order_by(func.count(Event.id).desc()).limit(10)
        )
        d1 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in st_res.all()]

        # d2: Event ID / Event Type or systemd unit
        is_linux = operating_system and "linux" in operating_system.lower()
        if is_linux:
            # Group by SYSLOG_IDENTIFIER
            unit_col = Event.metadata_["SYSLOG_IDENTIFIER"].as_string()
            u_res = await db.execute(
                select(unit_col, func.count(Event.id))
                .where(*base_filters, unit_col.isnot(None))
                .group_by(unit_col).order_by(func.count(Event.id).desc()).limit(10)
            )
            d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in u_res.all()]
            # d3: Log Priority
            prio_col = Event.metadata_["PRIORITY"].as_string()
            prio_res = await db.execute(
                select(prio_col, func.count(Event.id))
                .where(*base_filters, prio_col.isnot(None))
                .group_by(prio_col).order_by(func.count(Event.id).desc()).limit(8)
            )
            prio_map = {"0": "EMERGENCY", "1": "ALERT", "2": "CRITICAL", "3": "ERROR", "4": "WARNING", "5": "NOTICE", "6": "INFO", "7": "DEBUG"}
            d3 = [MetricDistributionItem(name=prio_map.get(str(r[0]), f"PRIO_{r[0]}"), value=r[1]) for r in prio_res.all()]
        else:
            # Group by Event Type / EventID
            et_res = await db.execute(
                select(func.coalesce(Event.event_type, "unknown"), func.count(Event.id))
                .where(*base_filters).group_by(Event.event_type).order_by(func.count(Event.id).desc()).limit(10)
            )
            d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in et_res.all()]
            # d3: Severity
            sev_res = await db.execute(
                select(func.coalesce(Event.severity, "UNKNOWN"), func.count(Event.id))
                .where(*base_filters).group_by(Event.severity)
            )
            d3 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in sev_res.all()]

    elif tab == "authentication":
        auth_filters = list(base_filters) + [Event.event_category == "authentication"]
        total = (await db.execute(select(func.count(Event.id)).where(*auth_filters))).scalar() or 0
        timeseries_data = await get_event_timeseries([Event.event_category == "authentication"])

        # d1: Successful vs Failed Actions
        act_res = await db.execute(
            select(func.coalesce(Event.action, "other"), func.count(Event.id))
            .where(*auth_filters).group_by(Event.action).order_by(func.count(Event.id).desc())
        )
        d1 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in act_res.all()]

        # d2: Top Usernames
        user_res = await db.execute(
            select(Event.username, func.count(Event.id))
            .where(*auth_filters, Event.username.isnot(None))
            .group_by(Event.username).order_by(func.count(Event.id).desc()).limit(10)
        )
        d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in user_res.all()]

        # d3: Source IP distribution (where non-empty and not '-')
        ip_res = await db.execute(
            select(Event.source_ip, func.count(Event.id))
            .where(*auth_filters, Event.source_ip.isnot(None), Event.source_ip != "-", Event.source_ip != "")
            .group_by(Event.source_ip).order_by(func.count(Event.id).desc()).limit(10)
        )
        d3 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in ip_res.all()]

    elif tab == "network":
        net_filters = list(base_filters) + [Event.event_category == "network"]
        total = (await db.execute(select(func.count(Event.id)).where(*net_filters))).scalar() or 0
        timeseries_data = await get_event_timeseries([Event.event_category == "network"])

        # d1: Protocol distribution
        proto_res = await db.execute(
            select(func.coalesce(Event.protocol, "unknown"), func.count(Event.id))
            .where(*net_filters).group_by(Event.protocol).order_by(func.count(Event.id).desc())
        )
        d1 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in proto_res.all()]

        # d2: Top Destination IPs
        dip_res = await db.execute(
            select(Event.destination_ip, func.count(Event.id))
            .where(*net_filters, Event.destination_ip.isnot(None), Event.destination_ip != "", Event.destination_ip != "-")
            .group_by(Event.destination_ip).order_by(func.count(Event.id).desc()).limit(10)
        )
        d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in dip_res.all()]

        # d3: Top Source IPs
        sip_res = await db.execute(
            select(Event.source_ip, func.count(Event.id))
            .where(*net_filters, Event.source_ip.isnot(None), Event.source_ip != "", Event.source_ip != "-")
            .group_by(Event.source_ip).order_by(func.count(Event.id).desc()).limit(10)
        )
        d3 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in sip_res.all()]

    elif tab == "firewall":
        fw_filters = list(base_filters) + [or_(Event.event_category == "firewall", Event.event_type.ilike("%firewall%"))]
        total = (await db.execute(select(func.count(Event.id)).where(*fw_filters))).scalar() or 0
        timeseries_data = await get_event_timeseries([or_(Event.event_category == "firewall", Event.event_type.ilike("%firewall%"))])

        # d1: Action (ALLOW vs DROP/BLOCK)
        act_res = await db.execute(
            select(func.coalesce(Event.action, "unknown"), func.count(Event.id))
            .where(*fw_filters).group_by(Event.action).order_by(func.count(Event.id).desc())
        )
        d1 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in act_res.all()]

        # d2: Protocol breakdown
        p_res = await db.execute(
            select(func.coalesce(Event.protocol, "unknown"), func.count(Event.id))
            .where(*fw_filters).group_by(Event.protocol).order_by(func.count(Event.id).desc())
        )
        d2 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in p_res.all()]

    elif tab == "processes":
        proc_filters = list(base_filters) + [Event.event_category == "process"]
        total = (await db.execute(select(func.count(Event.id)).where(*proc_filters))).scalar() or 0
        timeseries_data = await get_event_timeseries([Event.event_category == "process"])

        # d1: Actions (process_creation, termination, etc.)
        act_res = await db.execute(
            select(func.coalesce(Event.action, "process_activity"), func.count(Event.id))
            .where(*proc_filters).group_by(Event.action).order_by(func.count(Event.id).desc())
        )
        d1 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in act_res.all()]

        # d2: Top Users running processes
        u_res = await db.execute(
            select(Event.username, func.count(Event.id))
            .where(*proc_filters, Event.username.isnot(None))
            .group_by(Event.username).order_by(func.count(Event.id).desc()).limit(10)
        )
        d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in u_res.all()]

        # d3: Event Type
        et_res = await db.execute(
            select(func.coalesce(Event.event_type, "process"), func.count(Event.id))
            .where(*proc_filters).group_by(Event.event_type).order_by(func.count(Event.id).desc()).limit(10)
        )
        d3 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in et_res.all()]

    elif tab == "history":
        total_stmt = select(func.count(Event.id)).where(*base_filters)
        total = (await db.execute(total_stmt)).scalar() or 0
        timeseries_data = await get_event_timeseries()

        # d1: Category breakdown
        cat_res = await db.execute(
            select(func.coalesce(Event.event_category, "unknown"), func.count(Event.id))
            .where(*base_filters).group_by(Event.event_category).order_by(func.count(Event.id).desc()).limit(10)
        )
        d1 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in cat_res.all()]

        # d2: Ingestion volume by Hostname / Agent
        agent_res = await db.execute(
            select(func.coalesce(Event.hostname, "unknown"), func.count(Event.id))
            .where(*base_filters).group_by(Event.hostname).order_by(func.count(Event.id).desc()).limit(10)
        )
        d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in agent_res.all()]

        # d3: Severity distribution
        sev_res = await db.execute(
            select(func.coalesce(Event.severity, "UNKNOWN"), func.count(Event.id))
            .where(*base_filters).group_by(Event.severity)
        )
        d3 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in sev_res.all()]

    elif tab == "unified":
        # Cross-platform raw logs / unified explorer
        total_stmt = select(func.count(Event.id)).where(*base_filters)
        total = (await db.execute(total_stmt)).scalar() or 0
        timeseries_data = await get_event_timeseries()

        # d1: Distribution by Operating System
        os_res = await db.execute(
            select(func.coalesce(Event.operating_system, "unknown"), func.count(Event.id))
            .where(*base_filters).group_by(Event.operating_system).order_by(func.count(Event.id).desc())
        )
        d1 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in os_res.all()]

        # d2: Severity distribution
        sev_res = await db.execute(
            select(func.coalesce(Event.severity, "UNKNOWN"), func.count(Event.id))
            .where(*base_filters).group_by(Event.severity)
        )
        d2 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in sev_res.all()]

        # d3: Category distribution
        cat_res = await db.execute(
            select(func.coalesce(Event.event_category, "unknown"), func.count(Event.id))
            .where(*base_filters).group_by(Event.event_category).order_by(func.count(Event.id).desc()).limit(8)
        )
        d3 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in cat_res.all()]

    elif tab == "hosts":
        # Endpoint Management: Agents & Hosts status
        total_stmt = select(func.count(Agent.id))
        if operating_system:
            total_stmt = total_stmt.where(Agent.operating_system.ilike(f"%{operating_system}%"))
        total = (await db.execute(total_stmt)).scalar() or 0

        # Heartbeat status (5 min threshold)
        hb_threshold = now - timedelta(minutes=5)
        # d1: Active/Online vs Offline vs Retired
        status_stmt = select(Agent.status, func.count(Agent.id))
        if operating_system:
            status_stmt = status_stmt.where(Agent.operating_system.ilike(f"%{operating_system}%"))
        status_res = await db.execute(status_stmt.group_by(Agent.status))
        d1 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in status_res.all()]

        # d2: Events ingested per agent / hostname
        ingest_res = await db.execute(
            select(func.coalesce(Event.hostname, "unknown"), func.count(Event.id))
            .where(Event.timestamp >= start_time)
            .group_by(Event.hostname).order_by(func.count(Event.id).desc()).limit(10)
        )
        d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in ingest_res.all()]

        # d3: OS distribution of agents
        os_stmt = select(func.coalesce(Agent.operating_system, "unknown"), func.count(Agent.id))
        os_res = await db.execute(os_stmt.group_by(Agent.operating_system))
        d3 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in os_res.all()]

    elif tab == "alerts":
        # Alerts & Detections
        al_stmt = select(func.count(Alert.id)).where(Alert.first_seen >= start_time)
        total = (await db.execute(al_stmt)).scalar() or 0

        # Timeseries of alerts
        ts_res = await db.execute(
            select(
                func.date_trunc('hour', Alert.first_seen).label('hour_bucket'),
                func.count(Alert.id).label('cnt')
            )
            .where(Alert.first_seen >= start_time)
            .group_by('hour_bucket')
            .order_by('hour_bucket')
        )
        timeseries_data = [MetricTimeSeriesPoint(timestamp=row.hour_bucket, count=row.cnt) for row in ts_res.all() if row.hour_bucket]

        # d1: Severity distribution
        sev_res = await db.execute(
            select(Alert.severity, func.count(Alert.id))
            .where(Alert.first_seen >= start_time).group_by(Alert.severity)
        )
        d1 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in sev_res.all()]

        # d2: Status (OPEN vs RESOLVED vs IN_PROGRESS)
        st_res = await db.execute(
            select(Alert.status, func.count(Alert.id))
            .where(Alert.first_seen >= start_time).group_by(Alert.status)
        )
        d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in st_res.all()]

        # d3: Detection rule distribution
        r_res = await db.execute(
            select(DetectionRule.name, func.count(Alert.id))
            .join(DetectionRule, Alert.rule_id == DetectionRule.id)
            .where(Alert.first_seen >= start_time)
            .group_by(DetectionRule.name).order_by(func.count(Alert.id).desc()).limit(10)
        )
        d3 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in r_res.all()]

    elif tab == "investigations":
        inv_stmt = select(func.count(Investigation.id)).where(Investigation.created_at >= start_time)
        total = (await db.execute(inv_stmt)).scalar() or 0

        # Timeseries
        ts_res = await db.execute(
            select(
                func.date_trunc('hour', Investigation.created_at).label('hour_bucket'),
                func.count(Investigation.id).label('cnt')
            )
            .where(Investigation.created_at >= start_time)
            .group_by('hour_bucket').order_by('hour_bucket')
        )
        timeseries_data = [MetricTimeSeriesPoint(timestamp=row.hour_bucket, count=row.cnt) for row in ts_res.all() if row.hour_bucket]

        # d1: Severity
        sev_res = await db.execute(
            select(Investigation.severity, func.count(Investigation.id))
            .where(Investigation.created_at >= start_time).group_by(Investigation.severity)
        )
        d1 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in sev_res.all()]

        # d2: Status
        st_res = await db.execute(
            select(Investigation.status, func.count(Investigation.id))
            .where(Investigation.created_at >= start_time).group_by(Investigation.status)
        )
        d2 = [MetricDistributionItem(name=str(r[0]), value=r[1]) for r in st_res.all()]

    else:
        # Fallback to general event stats
        total = (await db.execute(select(func.count(Event.id)).where(*base_filters))).scalar() or 0
        timeseries_data = await get_event_timeseries()
        sev_res = await db.execute(select(func.coalesce(Event.severity, "UNKNOWN"), func.count(Event.id)).where(*base_filters).group_by(Event.severity))
        d1 = [MetricDistributionItem(name=str(r[0]).upper(), value=r[1]) for r in sev_res.all()]

    return TabAnalyticsResponse(
        total=total,
        timeseries=timeseries_data,
        distribution1=d1,
        distribution2=d2,
        distribution3=d3,
        distribution4=d4
    )

