from pydantic import BaseModel, ConfigDict
from typing import Optional, Any, List
from datetime import datetime
from backend.app.schemas.pagination import PaginatedResponse

class TimelineItem(BaseModel):
    id: int
    event_id: str
    timestamp: datetime
    received_at: Optional[datetime] = None
    event_type: Optional[str] = None
    event_category: Optional[str] = None
    severity: Optional[str] = None
    hostname: Optional[str] = None
    operating_system: Optional[str] = None
    agent_id: Optional[int] = None
    host_id: Optional[int] = None
    username: Optional[str] = None
    source_ip: Optional[str] = None
    source_port: Optional[int] = None
    destination_ip: Optional[str] = None
    destination_port: Optional[int] = None
    protocol: Optional[str] = None
    action: Optional[str] = None
    process_name: Optional[str] = None
    command_line: Optional[str] = None
    source_type: Optional[str] = None
    raw_log_id: Optional[int] = None
    provenance: Optional[str] = None
    context_type: Optional[str] = None
    context_reason: Optional[str] = None
    alert_id: Optional[str] = None
    alert_title: Optional[str] = None
    alert_severity: Optional[str] = None
    investigation_id: Optional[int] = None
    investigation_title: Optional[str] = None
    investigation_status: Optional[str] = None
    related_event_count: Optional[int] = None
    related_event_ids: Optional[List[int]] = None
    metadata_: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

class InvestigationTimelineMeta(BaseModel):
    id: int
    title: str
    status: str
    severity: str
    time_range_start: Optional[datetime] = None
    time_range_end: Optional[datetime] = None
    evidence_count: int = 0
    correlated_count: int = 0

class TimelineSummaryMetrics(BaseModel):
    total_events: int = 0
    direct_evidence_count: int = 0
    correlated_count: int = 0
    alerts_count: int = 0
    unique_hosts: List[str] = []
    unique_agents: List[int] = []
    unique_users: List[str] = []
    unique_source_ips: List[str] = []
    unique_destination_ips: List[str] = []

class TimelineResponse(PaginatedResponse[TimelineItem]):
    investigation_info: Optional[InvestigationTimelineMeta] = None
    summary: Optional[TimelineSummaryMetrics] = None
