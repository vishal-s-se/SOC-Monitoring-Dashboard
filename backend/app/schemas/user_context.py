from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class UserObservedHost(BaseModel):
    id: Optional[int] = None
    hostname: str
    operating_system: Optional[str] = None
    event_count: int = 0
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None


class UserObservedIp(BaseModel):
    ip_address: str
    role: str
    event_count: int = 0
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None


class UserAssociatedAlert(BaseModel):
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

    model_config = ConfigDict(from_attributes=True)


class UserAssociatedInvestigation(BaseModel):
    id: int
    title: str
    status: str
    severity: str
    created_at: datetime
    updated_at: datetime
    evidence_count_involving_user: int = 0


class UserAssociatedMitreTechnique(BaseModel):
    technique_id: str
    name: str
    tactics: List[dict] = []
    is_subtechnique: bool = False
    parent_technique_id: Optional[str] = None
    source: str
    confidence: str
    relationship: str
    evidence_reference: Optional[str] = None


class UserActivityBreakdown(BaseModel):
    event_category: str
    event_count: int


class UserContextSummary(BaseModel):
    username: str
    first_observed: Optional[datetime] = None
    last_observed: Optional[datetime] = None
    total_events: int = 0
    hosts_count: int = 0
    source_ips_count: int = 0
    destination_ips_count: int = 0
    alerts_count: int = 0
    investigations_count: int = 0
    mitre_techniques_count: int = 0


class UserContextOverview(BaseModel):
    summary: UserContextSummary
    hosts: List[UserObservedHost] = []
    source_ips: List[UserObservedIp] = []
    destination_ips: List[UserObservedIp] = []
    alerts: List[UserAssociatedAlert] = []
    investigations: List[UserAssociatedInvestigation] = []
    mitre_techniques: List[UserAssociatedMitreTechnique] = []
    activity_breakdown: List[UserActivityBreakdown] = []
