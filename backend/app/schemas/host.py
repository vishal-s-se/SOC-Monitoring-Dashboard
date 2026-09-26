from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class HostBase(BaseModel):
    host_identifier: str
    hostname: str
    operating_system: Optional[str] = None
    os_version: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = "ONLINE"

class HostCreate(HostBase):
    pass

class HostUpdate(BaseModel):
    hostname: Optional[str] = None
    operating_system: Optional[str] = None
    os_version: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = None
    last_seen: Optional[datetime] = None

class HostInDBBase(HostBase):
    id: int
    created_at: datetime
    updated_at: datetime
    last_seen: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class Host(HostInDBBase):
    pass
