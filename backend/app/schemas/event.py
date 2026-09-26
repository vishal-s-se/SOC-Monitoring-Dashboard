from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime

class EventBase(BaseModel):
    event_id: str
    timestamp: datetime
    host_id: Optional[int] = None
    agent_id: Optional[int] = None
    hostname: Optional[str] = None
    operating_system: Optional[str] = None
    source_type: Optional[str] = None
    event_category: Optional[str] = None
    event_type: Optional[str] = None
    username: Optional[str] = None
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    source_port: Optional[int] = None
    destination_port: Optional[int] = None
    protocol: Optional[str] = None
    action: Optional[str] = None
    severity: Optional[str] = None
    raw_log_id: Optional[int] = None
    metadata_: Optional[Any] = None

class EventCreate(EventBase):
    pass

class EventInDBBase(EventBase):
    id: int
    received_at: datetime

    model_config = ConfigDict(from_attributes=True)

class Event(EventInDBBase):
    pass
