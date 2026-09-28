from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Any
from datetime import datetime
from backend.app.models.investigation import InvestigationStatus, InvestigationSeverity, EvidenceType

# Notes schemas
class InvestigationNoteCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    author: Optional[str] = None

class InvestigationNote(BaseModel):
    id: int
    investigation_id: int
    content: str
    author: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Evidence schemas
class InvestigationEvidenceCreate(BaseModel):
    evidence_type: EvidenceType
    reference_id: str
    added_by: Optional[str] = None
    description: Optional[str] = None

class InvestigationEvidence(BaseModel):
    id: int
    investigation_id: int
    evidence_type: EvidenceType
    reference_id: str
    added_at: datetime
    added_by: Optional[str] = None
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

# Investigation schemas
class InvestigationBase(BaseModel):
    title: str = Field(..., min_length=3)
    description: Optional[str] = None
    status: InvestigationStatus = InvestigationStatus.OPEN
    severity: InvestigationSeverity = InvestigationSeverity.MEDIUM
    assigned_to: Optional[str] = None

class InvestigationCreate(InvestigationBase):
    evidence: Optional[List[InvestigationEvidenceCreate]] = []

class InvestigationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3)
    description: Optional[str] = None
    status: Optional[InvestigationStatus] = None
    severity: Optional[InvestigationSeverity] = None
    assigned_to: Optional[str] = None
    resolution: Optional[str] = None

class InvestigationStatusUpdate(BaseModel):
    status: InvestigationStatus
    resolution: Optional[str] = None

class InvestigationInDBBase(InvestigationBase):
    id: int
    created_at: datetime
    updated_at: datetime
    resolution: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InvestigationHistory(BaseModel):
    id: int
    investigation_id: int
    previous_status: Optional[str] = None
    new_status: str
    changed_by: Optional[str] = None
    reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
class Investigation(InvestigationInDBBase):
    evidence: List[InvestigationEvidence] = []
    notes: List[InvestigationNote] = []
    history: List[InvestigationHistory] = []

class InvestigationSummary(InvestigationInDBBase):
    evidence_count: int = 0

class InvestigationEvidenceSummary(BaseModel):
    alerts: int = 0
    events: int = 0
    raw_logs: int = 0
    hosts: int = 0
    agents: int = 0
    notes: int = 0
    total_evidence: int = 0
    mitre_techniques: int = 0
    mitre_tactics: int = 0
    analyst_confirmed: int = 0
    documented_rules: int = 0
