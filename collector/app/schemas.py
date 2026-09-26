from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

class AgentRegistration(BaseModel):
    agent_id: str = Field(..., description="Unique identifier for the agent")
    hostname: str
    operating_system: str
    agent_version: str
    ip_address: Optional[str] = None
    metadata_: Optional[Dict[str, Any]] = Field(None, alias="metadata")

class HeartbeatRequest(BaseModel):
    agent_id: str
    hostname: str
    agent_version: str
    timestamp: datetime
    connection_status: str
    ip_address: Optional[str] = None
    metadata_: Optional[Dict[str, Any]] = Field(None, alias="metadata")

class EventRequest(BaseModel):
    event_id: str
    agent_id: str
    hostname: str
    operating_system: Optional[str] = None
    timestamp: datetime
    event_type: str
    source: str
    payload: str
    metadata_: Optional[Dict[str, Any]] = Field(None, alias="metadata")
