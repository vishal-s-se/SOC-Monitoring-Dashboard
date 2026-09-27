from pydantic import BaseModel, ConfigDict
from typing import Optional, Any, List
from datetime import datetime

class DetectionRuleBase(BaseModel):
    rule_id: str
    name: str
    description: Optional[str] = None
    enabled: bool
    severity: str
    conditions: Any
    tags: Optional[Any] = None
    version: int

class DetectionRule(DetectionRuleBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class DetectionResultBase(BaseModel):
    event_id: int
    rule_id: int
    timestamp: datetime
    status: str
    alert_id: Optional[int] = None
    metadata_: Optional[Any] = None

class DetectionResult(DetectionResultBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
