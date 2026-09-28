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


from typing import Dict, Any

class MetricOverviewResponse(BaseModel):
    time_range: str
    events_received: int
    alerts_open: int
    alerts_resolved: int
    investigations_active: int
    behavioral_deviations: int
    generated_at: datetime

class MetricTimeSeriesPoint(BaseModel):
    timestamp: datetime
    count: int

class MetricTimeSeriesResponse(BaseModel):
    metric_name: str
    interval: str
    data: List[MetricTimeSeriesPoint]
    
class MetricRuleMatch(BaseModel):
    rule_name: str
    match_count: int
    severity: str

class MetricDetectionsResponse(BaseModel):
    total_evaluations: int
    total_matches: int
    rule_matches: List[MetricRuleMatch]

class MetricTelemetryResponse(BaseModel):
    total_events: int
    by_category: Dict[str, int]
    by_severity: Dict[str, int]

class MetricAlertsResponse(BaseModel):
    total_alerts: int
    by_severity: Dict[str, int]
    by_status: Dict[str, int]

class MetricInvestigationsResponse(BaseModel):
    total_investigations: int
    by_status: Dict[str, int]
    by_severity: Dict[str, int]

class MetricAgentHealthResponse(BaseModel):
    total_agents: int
    online_agents: int
    offline_agents: int

class MetricMitreResponse(BaseModel):
    mapped_events: int
    mapped_alerts: int
    by_tactic: Dict[str, int]
