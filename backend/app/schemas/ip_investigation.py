from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime

class IpSummaryMetrics(BaseModel):
    ip_address: str
    ip_version: str  # "IPv4" or "IPv6"
    address_scope: str  # "private", "loopback", "link-local", "multicast", "unspecified", "public"
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None
    total_events: int = 0
    source_events_count: int = 0
    destination_events_count: int = 0
    alerts_count: int = 0
    hosts_count: int = 0
    agents_count: int = 0
    users_count: int = 0
    investigations_count: int = 0
    mitre_techniques_count: int = 0

class IpAssociatedAlert(BaseModel):
    id: int
    alert_id: str
    title: str
    severity: str
    status: str
    first_seen: datetime
    last_seen: datetime
    occurrence_count: int
    observed_roles: List[str] = []  # ["source", "destination"]
    hostname: Optional[str] = None
    rule_id: Optional[int] = None
    rule_name: Optional[str] = None
    mitre_techniques: List[str] = []

    model_config = ConfigDict(from_attributes=True)

class IpAssociatedHost(BaseModel):
    id: Optional[int] = None
    hostname: str
    host_identifier: Optional[str] = None
    operating_system: Optional[str] = None
    status: Optional[str] = None
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None
    event_count: int = 0
    roles: List[str] = []  # ["source", "destination"]

class IpAssociatedAgent(BaseModel):
    id: int
    agent_id: str
    hostname: Optional[str] = None
    operating_system: Optional[str] = None
    status: Optional[str] = None
    event_count: int = 0

class IpAssociatedUser(BaseModel):
    username: str
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None
    event_count: int = 0
    associated_hosts: List[str] = []

class IpAssociatedInvestigation(BaseModel):
    id: int
    title: str
    status: str
    severity: str
    created_at: datetime
    updated_at: datetime
    evidence_count_involving_ip: int = 0

class IpAssociatedMitreTechnique(BaseModel):
    technique_id: str
    name: str
    tactics: List[dict] = []
    is_subtechnique: bool = False
    parent_technique_id: Optional[str] = None
    source: str
    confidence: str
    relationship: str
    evidence_reference: Optional[str] = None

class IpInvestigationOverview(BaseModel):
    summary: IpSummaryMetrics
    associated_hosts: List[IpAssociatedHost] = []
    associated_agents: List[IpAssociatedAgent] = []
    associated_users: List[IpAssociatedUser] = []
    associated_investigations: List[IpAssociatedInvestigation] = []
    mitre_techniques: List[IpAssociatedMitreTechnique] = []
