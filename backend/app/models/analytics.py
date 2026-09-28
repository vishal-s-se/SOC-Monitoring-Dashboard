from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.db.base_class import Base

class BehaviorBaseline(Base):
    __tablename__ = "behavior_baseline"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, index=True, nullable=False) # 'USER', 'HOST', 'IP'
    entity_id = Column(String, index=True, nullable=False)   # e.g., username or ip address
    metric_name = Column(String, index=True, nullable=False) # e.g., 'hourly_event_volume', 'login_hours'
    time_window = Column(String, nullable=False)             # e.g., '1h', '24h', 'weekday_active'
    expected_value = Column(Float, nullable=False)
    variance = Column(Float, nullable=False, default=0.0)    # stddev or variance
    sample_count = Column(Integer, nullable=False, default=0)
    
    last_calculated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    deviations = relationship("BehaviorDeviation", back_populates="baseline", cascade="all, delete-orphan")

class BehaviorDeviation(Base):
    __tablename__ = "behavior_deviation"

    id = Column(Integer, primary_key=True, index=True)
    baseline_id = Column(Integer, ForeignKey("behavior_baseline.id"), nullable=False, index=True)
    entity_type = Column(String, index=True, nullable=False)
    entity_id = Column(String, index=True, nullable=False)
    metric_name = Column(String, index=True, nullable=False)
    
    observed_value = Column(Float, nullable=False)
    expected_value = Column(Float, nullable=False)
    deviation_magnitude = Column(Float, nullable=False)      # e.g., z-score
    observation_timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    explanation = Column(String, nullable=False)
    
    is_acknowledged = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    baseline = relationship("BehaviorBaseline", back_populates="deviations")
    evidence = relationship("BehaviorDeviationEvidence", back_populates="deviation", cascade="all, delete-orphan")

class BehaviorDeviationEvidence(Base):
    __tablename__ = "behavior_deviation_evidence"

    id = Column(Integer, primary_key=True, index=True)
    deviation_id = Column(Integer, ForeignKey("behavior_deviation.id"), nullable=False, index=True)
    evidence_type = Column(String, nullable=False) # 'EVENT', 'ALERT'
    reference_id = Column(String, nullable=False)

    deviation = relationship("BehaviorDeviation", back_populates="evidence")
