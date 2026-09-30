from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime

class ServiceHealth(BaseModel):
    service: str
    status: str  # HEALTHY, DEGRADED, UNAVAILABLE, UNKNOWN
    latency_ms: Optional[float] = None
    message: Optional[str] = None
    last_check: datetime

class QueueHealth(BaseModel):
    queue_name: str
    status: str
    size: int
    capacity: Optional[int] = None
    utilization_pct: Optional[float] = None
    enqueue_rate_per_sec: Optional[float] = None
    processing_rate_per_sec: Optional[float] = None
    dropped_events: int = 0
    errors: int = 0

class HealthOverview(BaseModel):
    overall_status: str
    services: List[ServiceHealth]
    queues: List[QueueHealth]
    active_agents: int
    active_hosts: int
    active_websockets: int
    events_per_second: float
    timestamp: datetime
    cleanup_status: Optional[Dict[str, Any]] = None
