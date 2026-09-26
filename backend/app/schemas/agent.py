from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime

class AgentBase(BaseModel):
    agent_id: str
    host_id: int
    hostname: Optional[str] = None
    operating_system: Optional[str] = None
    agent_version: Optional[str] = None
    status: Optional[str] = "OFFLINE"
    ip_address: Optional[str] = None
    metadata_: Optional[Any] = None

class AgentCreate(AgentBase):
    pass

class AgentUpdate(BaseModel):
    hostname: Optional[str] = None
    operating_system: Optional[str] = None
    agent_version: Optional[str] = None
    status: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    ip_address: Optional[str] = None
    metadata_: Optional[Any] = None

class AgentInDBBase(AgentBase):
    id: int
    registered_at: datetime
    last_heartbeat: Optional[datetime] = None
    last_seen: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class Agent(AgentInDBBase):
    pass
