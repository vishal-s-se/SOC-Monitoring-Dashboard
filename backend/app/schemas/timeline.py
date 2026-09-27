from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime

class TimelineItem(BaseModel):
    id: int
    event_id: str
    timestamp: datetime
    received_at: Optional[datetime] = None
    event_type: Optional[str] = None
    event_category: Optional[str] = None
    severity: Optional[str] = None
    hostname: Optional[str] = None
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
    context_type: Optional[str] = None
    context_reason: Optional[str] = None
    metadata_: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)
