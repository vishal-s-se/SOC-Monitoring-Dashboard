from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime

class AlertBase(BaseModel):
    alert_id: str
    title: str
    description: Optional[str] = None
    severity: str
    status: str
    first_seen: datetime
    last_seen: datetime
    occurrence_count: int
    fingerprint: str
    rule_id: int
    agent_id: Optional[int] = None
    host_id: Optional[int] = None
    metadata_: Optional[Any] = None

class Alert(AlertBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
