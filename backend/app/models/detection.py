from sqlalchemy import Column, String, DateTime, func, Integer, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from backend.app.db.base_class import Base

class DetectionRule(Base):
    __tablename__ = "detection_rule"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(String, unique=True, index=True, nullable=False) # e.g. RUL-001
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    severity = Column(String, nullable=False) # LOW, MEDIUM, HIGH, CRITICAL

    # Conditions stored as JSONB for dynamic rule queries
    # e.g., [{"field": "event_type", "operator": "equals", "value": "ssh_login"}]
    conditions = Column(JSONB, nullable=False)

    tags = Column(JSONB, nullable=True) # ["auth", "linux"]
    version = Column(Integer, default=1, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    results = relationship("DetectionResult", back_populates="rule")


class DetectionResult(Base):
    __tablename__ = "detection_result"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("event.id"), nullable=False)
    rule_id = Column(Integer, ForeignKey("detection_rule.id"), nullable=False)

    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(String, default="NEW") # NEW, PROCESSED

    alert_id = Column(Integer, ForeignKey("alert.id"), nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)

    # Relationships
    event = relationship("Event")
    rule = relationship("DetectionRule", back_populates="results")
    alert = relationship("Alert", back_populates="detection_results")
