from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime


class EventContextHost(BaseModel):
    id: int
    hostname: str
    operating_system: Optional[str] = None
    os_version: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = None
    last_seen: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EventContextAgent(BaseModel):
    id: int
    agent_id: str
    hostname: Optional[str] = None
    status: Optional[str] = None
    last_seen: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EventContextAlert(BaseModel):
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


class EventContextInvestigation(BaseModel):
    id: int
    title: str
    status: str
    severity: str
    created_at: datetime
    updated_at: datetime


class EventContextMitreTechnique(BaseModel):
    technique_id: str
    name: str
    tactics: List[dict] = []
    is_subtechnique: bool = False
    parent_technique_id: Optional[str] = None
    source: str
    confidence: str
    evidence_reference: Optional[str] = None


class EventContextNearbyEvent(BaseModel):
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


class EventContext(BaseModel):
    event_id: str
    id: int
    timestamp: datetime
    hostname: Optional[str] = None
    username: Optional[str] = None
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    event_type: Optional[str] = None
    event_category: Optional[str] = None
    severity: Optional[str] = None
    action: Optional[str] = None
    host: Optional[EventContextHost] = None
    agent: Optional[EventContextAgent] = None
    alerts: List[EventContextAlert] = []
    investigations: List[EventContextInvestigation] = []
    mitre_techniques: List[EventContextMitreTechnique] = []
    nearby_events: List[EventContextNearbyEvent] = []
    raw_log_id: Optional[int] = None
