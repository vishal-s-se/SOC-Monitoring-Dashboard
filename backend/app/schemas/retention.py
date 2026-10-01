from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class RetentionPolicyBase(BaseModel):
    raw_logs_days: int = Field(7, ge=1, le=3650)
    normalized_events_days: int = Field(30, ge=1, le=3650)
    detection_results_days: int = Field(90, ge=1, le=3650)
    alerts_days: int = Field(90, ge=1, le=3650)
    behavioral_data_days: int = Field(90, ge=1, le=3650)

class RetentionPolicyUpdate(RetentionPolicyBase):
    pass

class RetentionPolicyInDB(RetentionPolicyBase):
    id: int
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None

    class Config:
        orm_mode = True

class CleanupPreviewRequest(BaseModel):
    pass

class CleanupPreviewResponse(BaseModel):
    raw_logs_eligible: int
    events_eligible: int
    detection_results_eligible: int
    alerts_eligible: int
    behavioral_data_eligible: int
    estimated_total: int
    cutoff_times: Dict[str, datetime]

class CleanupResult(BaseModel):
    execution_id: str
    is_dry_run: bool
    status: str
    records_examined: int
    records_deleted: int
    records_skipped: int
    records_failed: int
    duration_seconds: int

class CleanupAuditLogResponse(BaseModel):
    id: int
    execution_id: str
    timestamp: datetime
    initiated_by: Optional[str]
    is_manual: bool
    is_dry_run: bool
    status: str
    records_examined: int
    records_deleted: int
    records_skipped: int
    records_failed: int
    duration_seconds: int
    details: Optional[Dict[str, Any]]

    class Config:
        orm_mode = True
