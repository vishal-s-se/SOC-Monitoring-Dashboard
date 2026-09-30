import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from datetime import datetime, timezone, timedelta
from typing import List

from backend.app.db.session import get_db
from backend.app.schemas.health import HealthOverview, ServiceHealth, QueueHealth
from backend.app.models.agent import Agent
from backend.app.models.host import Host
from backend.app.models.event import Event
from backend.app.api.v1.endpoints.ws import manager

router = APIRouter()

@router.get("/overview", response_model=HealthOverview)
async def get_health_overview(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    
    # Check DB
    db_status = "HEALTHY"
    db_latency = 0.0
    start_time = time.time()
    try:
        await db.execute(text("SELECT 1"))
        db_latency = (time.time() - start_time) * 1000
    except Exception as e:
        db_status = "UNAVAILABLE"
        
    services = [
        ServiceHealth(
            service="database",
            status=db_status,
            latency_ms=db_latency,
            last_check=now
        ),
        ServiceHealth(
            service="api",
            status="HEALTHY",
            latency_ms=1.5,
            last_check=now
        ),
        ServiceHealth(
            service="collector",
            status="HEALTHY",
            latency_ms=0.0,
            last_check=now
        )
    ]
    
    overall_status = "HEALTHY" if db_status == "HEALTHY" else "DEGRADED"
    
    # Active Agents
    agents_count = (await db.execute(select(func.count(Agent.id)).where(Agent.status == "ONLINE"))).scalar() or 0
    # Active Hosts
    hosts_count = (await db.execute(select(func.count(Host.id)).where(Host.status == "ONLINE"))).scalar() or 0
    
    # EPS (Events per sec over last 1 min)
    one_min_ago = now - timedelta(minutes=1)
    events_last_min = (await db.execute(select(func.count(Event.id)).where(Event.timestamp >= one_min_ago))).scalar() or 0
    eps = events_last_min / 60.0
    
    queues = [
        QueueHealth(
            queue_name="synchronous_ingest",
            status="HEALTHY",
            size=0,
            capacity=1000,
            utilization_pct=0.0,
            enqueue_rate_per_sec=eps,
            processing_rate_per_sec=eps,
            dropped_events=0,
            errors=0
        )
    ]
    
    return HealthOverview(
        overall_status=overall_status,
        services=services,
        queues=queues,
        active_agents=agents_count,
        active_hosts=hosts_count,
        active_websockets=len(manager.active_connections),
        events_per_second=round(eps, 2),
        timestamp=now
    )

@router.get("/services", response_model=List[ServiceHealth])
async def get_services_health(db: AsyncSession = Depends(get_db)):
    overview = await get_health_overview(db)
    return overview.services

@router.get("/queue", response_model=List[QueueHealth])
async def get_queue_health(db: AsyncSession = Depends(get_db)):
    overview = await get_health_overview(db)
    return overview.queues
