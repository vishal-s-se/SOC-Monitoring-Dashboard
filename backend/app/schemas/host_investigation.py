from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime

class HostIdentity(BaseModel):
    id: int
    host_identifier: str
    hostname: str
    operating_system: Optional[str] = None
    os_version: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = "ONLINE"
    created_at: Optional[datetime] = None
    last_seen: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class HostAssociatedAgent(BaseModel):
    id: int
    agent_id: str
    hostname: Optional[str] = None
    operating_system: Optional[str] = None
    agent_version: Optional[str] = None
    status: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    registered_at: Optional[datetime] = None
    ip_address: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class HostSummaryMetrics(BaseModel):
    host_id: int
    hostname: str
    operating_system: Optional[str] = None
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None
    total_events: int = 0
    alerts_count: int = 0
    users_count: int = 0
    source_ips_count: int = 0
    destination_ips_count: int = 0
    investigations_count: int = 0
    mitre_techniques_count: int = 0

class HostAssociatedAlert(BaseModel):
    id: int
    alert_id: str
    title: str
    severity: str
    status: str
    first_seen: datetime
    last_seen: datetime
    occurrence_count: int
    rule_id: Optional[int] = None
    rule_name: Optional[str] = None
    mitre_techniques: List[str] = []

    model_config = ConfigDict(from_attributes=True)

class HostObservedUser(BaseModel):
    username: str
    event_count: int = 0
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None
    associated_ips: List[str] = []

class HostAssociatedIp(BaseModel):
    ip_address: str
    event_count: int = 0
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None

class HostAssociatedInvestigation(BaseModel):
    id: int
    title: str
    status: str
    severity: str
    created_at: datetime
    updated_at: datetime
    evidence_count_involving_host: int = 0

class HostAssociatedMitreTechnique(BaseModel):
    technique_id: str
    name: str
    tactics: List[dict] = []
    is_subtechnique: bool = False
    parent_technique_id: Optional[str] = None
    source: str
    confidence: str
    relationship: str
    evidence_reference: Optional[str] = None

class HostInvestigationOverview(BaseModel):
    host: HostIdentity
    agents: List[HostAssociatedAgent] = []
    summary: HostSummaryMetrics
    users: List[HostObservedUser] = []
    source_ips: List[HostAssociatedIp] = []
    destination_ips: List[HostAssociatedIp] = []
    investigations: List[HostAssociatedInvestigation] = []
    mitre_techniques: List[HostAssociatedMitreTechnique] = []
