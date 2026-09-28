from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime


class AlertContextRule(BaseModel):
    id: int
    rule_id: str
    name: str
    description: Optional[str] = None
    severity: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AlertContextHost(BaseModel):
    id: int
    hostname: str
    operating_system: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = None
    last_seen: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AlertContextAgent(BaseModel):
    id: int
    agent_id: str
    hostname: Optional[str] = None
    status: Optional[str] = None
    last_seen: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AlertContextEvent(BaseModel):
    id: int
    event_id: str
    timestamp: datetime
    event_type: Optional[str] = None
    event_category: Optional[str] = None
    severity: Optional[str] = None
    username: Optional[str] = None
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    action: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AlertContextInvestigation(BaseModel):
    id: int
    title: str
    status: str
    severity: str
    created_at: datetime
    updated_at: datetime


class AlertContextMitreTechnique(BaseModel):
    technique_id: str
    name: str
    tactics: List[dict] = []
    is_subtechnique: bool = False
    parent_technique_id: Optional[str] = None
    source: str
    confidence: str
    relationship: str
    evidence_reference: Optional[str] = None


class AlertContextIp(BaseModel):
    ip_address: str
    role: str
    event_count: int = 0


class AlertContext(BaseModel):
    id: int
    alert_id: str
    title: str
    severity: str
    status: str
    first_seen: datetime
    last_seen: datetime
    occurrence_count: int
    rule: Optional[AlertContextRule] = None
    host: Optional[AlertContextHost] = None
    agent: Optional[AlertContextAgent] = None
    triggering_events: List[AlertContextEvent] = []
    observed_ips: List[AlertContextIp] = []
    investigations: List[AlertContextInvestigation] = []
    mitre_techniques: List[AlertContextMitreTechnique] = []
