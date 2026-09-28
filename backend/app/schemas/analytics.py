from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class BehaviorBaselineBase(BaseModel):
    entity_type: str
    entity_id: str
    metric_name: str
    time_window: str
    expected_value: float
    variance: float = 0.0
    sample_count: int = 0

class BehaviorBaselineCreate(BehaviorBaselineBase):
    pass

class BehaviorBaselineResponse(BehaviorBaselineBase):
    id: int
    last_calculated_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class BehaviorDeviationEvidenceBase(BaseModel):
    evidence_type: str
    reference_id: str

class BehaviorDeviationEvidenceResponse(BehaviorDeviationEvidenceBase):
    id: int

    class Config:
        from_attributes = True

class BehaviorDeviationBase(BaseModel):
    entity_type: str
    entity_id: str
    metric_name: str
    observed_value: float
    expected_value: float
    deviation_magnitude: float
    observation_timestamp: datetime
    explanation: str
    is_acknowledged: bool = False

class BehaviorDeviationCreate(BehaviorDeviationBase):
    baseline_id: int
    evidence: List[BehaviorDeviationEvidenceBase] = []

class BehaviorDeviationResponse(BehaviorDeviationBase):
    id: int
    baseline_id: int
    created_at: datetime
    evidence: List[BehaviorDeviationEvidenceResponse] = []

    class Config:
        from_attributes = True

class BehaviorCorrelationResponse(BaseModel):
    id: int
    deviation_id: int
    related_entity_type: str
    related_entity_id: str
    relationship_type: str
    relationship_reason: str
    time_difference_seconds: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

