from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime

class RawLogBase(BaseModel):
    event_identifier: str
    host_id: Optional[int] = None
    agent_id: Optional[int] = None
    source_type: str
    source_name: Optional[str] = None
    timestamp: datetime
    raw_payload: str
    metadata_: Optional[Any] = None
    ingestion_status: Optional[str] = "PENDING"

class RawLogCreate(RawLogBase):
    pass

class RawLogInDBBase(RawLogBase):
    id: int
    received_at: datetime

    model_config = ConfigDict(from_attributes=True)

class RawLog(RawLogInDBBase):
    pass
