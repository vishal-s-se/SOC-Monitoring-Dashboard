from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
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
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    events_res = await db.execute(select(func.count(Event.id)).where(Event.timestamp >= start_time))
    events_count = events_res.scalar() or 0
    
    alerts_open_res = await db.execute(select(func.count(Alert.id)).where(Alert.status == 'OPEN', Alert.first_seen >= start_time))
    alerts_open = alerts_open_res.scalar() or 0
    
    alerts_res_res = await db.execute(select(func.count(Alert.id)).where(Alert.status == 'RESOLVED', Alert.first_seen >= start_time))
    alerts_resolved = alerts_res_res.scalar() or 0
    
    inv_res = await db.execute(select(func.count(Investigation.id)).where(Investigation.status != 'CLOSED', Investigation.created_at >= start_time))
    inv_active = inv_res.scalar() or 0
    
    dev_res = await db.execute(select(func.count(BehaviorDeviation.id)).where(BehaviorDeviation.observation_timestamp >= start_time))
    dev_count = dev_res.scalar() or 0
    
    return MetricOverviewResponse(
        time_range=f"last_{hours}h",
        events_received=events_count,
        alerts_open=alerts_open,
        alerts_resolved=alerts_resolved,
        investigations_active=inv_active,
        behavioral_deviations=dev_count,
        generated_at=now
    )

@router.get("/timeseries", response_model=MetricTimeSeriesResponse)
async def get_analytics_timeseries(
    metric: str = Query("events", description="events or alerts"),
    hours: int = 24,
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    if metric == "events":
        model = Event
        time_col = Event.timestamp
    else:
        model = Alert
        time_col = Alert.first_seen
        
    stmt = select(
        func.date_trunc('hour', time_col).label('hour_bucket'),
        func.count(model.id).label('count')
    ).where(time_col >= start_time).group_by('hour_bucket').order_by('hour_bucket')
    
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
    MetricInvestigationsResponse, MetricAgentHealthResponse, MetricMitreResponse
)
from backend.app.models.agent import Agent
from backend.app.models.mitre import MitreMapping

@router.get("/telemetry", response_model=MetricTelemetryResponse)
async def get_analytics_telemetry(hours: int = 24, db: AsyncSession = Depends(get_db)):
    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    total = (await db.execute(select(func.count(Event.id)).where(Event.timestamp >= start_time))).scalar() or 0
    
    cat_res = await db.execute(select(Event.event_category, func.count(Event.id)).where(Event.timestamp >= start_time).group_by(Event.event_category))
    by_category = {row[0] or "unknown": row[1] for row in cat_res.all()}
    
    sev_res = await db.execute(select(Event.severity, func.count(Event.id)).where(Event.timestamp >= start_time).group_by(Event.severity))
    by_severity = {row[0] or "unknown": row[1] for row in sev_res.all()}
    
    return MetricTelemetryResponse(total_events=total, by_category=by_category, by_severity=by_severity)

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
async def get_analytics_agents(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count(Agent.id)))).scalar() or 0
    online = (await db.execute(select(func.count(Agent.id)).where(Agent.status == "ONLINE"))).scalar() or 0
    offline = total - online
    
    return MetricAgentHealthResponse(total_agents=total, online_agents=online, offline_agents=offline)

@router.get("/mitre", response_model=MetricMitreResponse)
async def get_analytics_mitre(db: AsyncSession = Depends(get_db)):
    mapped_events = (await db.execute(select(func.count(MitreMapping.id)).where(MitreMapping.entity_type == "EVENT"))).scalar() or 0
    mapped_alerts = (await db.execute(select(func.count(MitreMapping.id)).where(MitreMapping.entity_type == "ALERT"))).scalar() or 0
    
    tactic_res = await db.execute(select(MitreMapping.tactic, func.count(MitreMapping.id)).group_by(MitreMapping.tactic))
    by_tactic = {row[0] or "unknown": row[1] for row in tactic_res.all()}
    
    return MetricMitreResponse(mapped_events=mapped_events, mapped_alerts=mapped_alerts, by_tactic=by_tactic)
