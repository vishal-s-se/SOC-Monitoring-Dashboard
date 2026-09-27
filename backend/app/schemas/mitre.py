from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Any, Dict
from datetime import datetime
import re
from backend.app.models.mitre import MitreTargetType, MitreMappingSource, MitreConfidence

MITRE_TECHNIQUE_ID_REGEX = re.compile(r"^T\d{4}(?:\.\d{3})?$")
MITRE_TACTIC_ID_REGEX = re.compile(r"^TA\d{4}$")

# --- Tactics ---
class MitreTacticBase(BaseModel):
    tactic_id: str
    name: str
    description: Optional[str] = None
    external_url: Optional[str] = None
    order_index: int = 0

    @field_validator("tactic_id")
    @classmethod
    def validate_tactic_id(cls, v: str) -> str:
        v = v.strip().upper()
        if not MITRE_TACTIC_ID_REGEX.match(v):
            raise ValueError(f"Invalid MITRE Tactic ID format: '{v}'. Expected format 'TAxxxx' (e.g. TA0001)")
        return v

class MitreTactic(MitreTacticBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class MitreTacticSummary(BaseModel):
    tactic_id: str
    name: str
    order_index: int = 0
    model_config = ConfigDict(from_attributes=True)

# --- Techniques ---
class MitreTechniqueBase(BaseModel):
    technique_id: str
    name: str
    description: Optional[str] = None
    is_subtechnique: bool = False
    parent_technique_id: Optional[str] = None
    platforms: Optional[List[str]] = None
    data_sources: Optional[List[str]] = None
    is_deprecated: bool = False
    dataset_version: Optional[str] = None

    @field_validator("technique_id")
    @classmethod
    def validate_technique_id(cls, v: str) -> str:
        v = v.strip().upper()
        if not MITRE_TECHNIQUE_ID_REGEX.match(v):
            raise ValueError(f"Invalid MITRE Technique ID format: '{v}'. Expected format 'Txxxx' or 'Txxxx.xxx' (e.g. T1059 or T1059.001)")
        return v

    @field_validator("parent_technique_id")
    @classmethod
    def validate_parent_id(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip().upper()
            if not MITRE_TECHNIQUE_ID_REGEX.match(v):
                raise ValueError(f"Invalid MITRE Parent Technique ID format: '{v}'. Expected 'Txxxx'")
        return v

class MitreTechniqueSummary(BaseModel):
    id: int
    technique_id: str
    name: str
    is_subtechnique: bool
    parent_technique_id: Optional[str] = None
    platforms: Optional[List[str]] = None
    is_deprecated: bool = False
    tactics: List[MitreTacticSummary] = []
    mapping_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class MitreTechniqueDetail(MitreTechniqueBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    tactics: List[MitreTacticSummary] = []
    subtechniques: List["MitreTechniqueSummary"] = []
    parent_technique: Optional["MitreTechniqueSummary"] = None

    # Mapped entities
    detection_rules: List[Dict[str, Any]] = []
    alerts: List[Dict[str, Any]] = []
    investigations: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []

    model_config = ConfigDict(from_attributes=True)

# --- Mappings ---
class MitreMappingCreate(BaseModel):
    technique_id: str
    target_type: MitreTargetType
    target_id: str
    mapping_source: MitreMappingSource = MitreMappingSource.ANALYST_CONFIRMED
    confidence: MitreConfidence = MitreConfidence.MEDIUM
    evidence_reference: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None

    @field_validator("technique_id")
    @classmethod
    def validate_technique_id(cls, v: str) -> str:
        v = v.strip().upper()
        if not MITRE_TECHNIQUE_ID_REGEX.match(v):
            raise ValueError(f"Invalid MITRE Technique ID format: '{v}'")
        return v

class MitreMapping(BaseModel):
    id: int
    technique_id: str
    technique_name: Optional[str] = None
    tactics: List[MitreTacticSummary] = []
    target_type: str
    target_id: str
    mapping_source: str
    confidence: str
    evidence_reference: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# Fix forward refs for recursive subtechniques/parent
from typing import Dict
MitreTechniqueDetail.model_rebuild()
