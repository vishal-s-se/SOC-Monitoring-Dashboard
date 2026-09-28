from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime

class IntelEntityHost(BaseModel):
    hostname: str
    host_id: Optional[int] = None
    operating_system: Optional[str] = None
    agent_id: Optional[str] = None
    event_count: int = 0
    alert_count: int = 0
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None

class IntelEntityIp(BaseModel):
    ip_address: str
    role: str
    event_count: int = 0
    alert_count: int = 0
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None

class IntelEntityUser(BaseModel):
    username: str
    event_count: int = 0
    host_count: int = 0
    ip_count: int = 0
    alert_count: int = 0
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None

class IntelAlert(BaseModel):
    id: int
    alert_id: str
    title: str
    severity: str
    status: str
    timestamp: datetime
    host: Optional[str] = None
    rule_name: Optional[str] = None
    mitre_mappings: List[str] = []
    evidence_count: int = 0

class IntelDetectionRule(BaseModel):
    id: int
    rule_id: str
    name: str
    severity: str
    detection_type: str
    mitre_mappings: List[str] = []
    alert_count: int = 0
    evidence_count: int = 0

class IntelMitreMapping(BaseModel):
    technique_id: str
    technique_name: str
    tactics: List[str] = []
    is_subtechnique: bool = False
    mapping_source: str
    confidence: str
    evidence_count: int = 0
    provenance: str

class IntelTimelineSummary(BaseModel):
    first_event: Optional[datetime] = None
    last_event: Optional[datetime] = None
    total_timeline_events: int = 0
    direct_evidence_count: int = 0
    correlated_events_count: int = 0
    alerts_represented: int = 0
    mitre_associated_events: int = 0

class IntelEvent(BaseModel):
    id: int
    event_id: str
    timestamp: datetime
    event_type: Optional[str] = None
    event_category: Optional[str] = None
    severity: Optional[str] = None
    hostname: Optional[str] = None
    username: Optional[str] = None
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    is_direct: bool = True
    correlation_reason: Optional[str] = None
    provenance: str

class IntelHistoricalContext(BaseModel):
    time_range_type: str  # e.g. "CURRENT_INVESTIGATION", "HISTORICAL_OBSERVATION"
    observation: str

class IntelRelatedInvestigation(BaseModel):
    id: int
    title: str
    status: str
    created_at: datetime
    updated_at: datetime
    shared_entity: str
    evidence_count: int = 0

class IntelSummary(BaseModel):
    total_evidence: int = 0
    events: int = 0
    raw_logs: int = 0
    alerts: int = 0
    hosts: int = 0
    agents: int = 0
    source_ips: int = 0
    destination_ips: int = 0
    users: int = 0
    mitre_techniques: int = 0
    timeline_events: int = 0
    detection_rules: int = 0

class InvestigationIntelligenceOverview(BaseModel):
    investigation_id: int
    summary: IntelSummary
    hosts: List[IntelEntityHost] = []
    ips: List[IntelEntityIp] = []
    users: List[IntelEntityUser] = []
    alerts: List[IntelAlert] = []
    detection_rules: List[IntelDetectionRule] = []
    mitre: List[IntelMitreMapping] = []
    timeline_summary: IntelTimelineSummary
    events: List[IntelEvent] = []
    historical_context: List[IntelHistoricalContext] = []
    related_investigations: List[IntelRelatedInvestigation] = []
