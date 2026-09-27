from sqlalchemy import Column, String, DateTime, func, Integer, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from backend.app.db.base_class import Base

class Alert(Base):
    __tablename__ = "alert"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(String, unique=True, index=True, nullable=False) # UUID or standard format
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    severity = Column(String, index=True, nullable=False) # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String, index=True, default="OPEN", nullable=False) # OPEN, ACKNOWLEDGED, RESOLVED

    first_seen = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    last_seen = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    occurrence_count = Column(Integer, default=1, nullable=False)

    # Fingerprint for deduplication (e.g., rule_id + agent_id)
    fingerprint = Column(String, index=True, nullable=False)

    # Evidence / References
    rule_id = Column(Integer, ForeignKey("detection_rule.id"), nullable=False)
    agent_id = Column(Integer, ForeignKey("agent.id"), nullable=True)
    host_id = Column(Integer, ForeignKey("host.id"), nullable=True)

    metadata_ = Column("metadata", JSONB, nullable=True)

    # We might link many detection results to an alert,
    # but initially we can just reference the most recent or list them in metadata.
    # The actual DetectionResults can have an alert_id foreign key.

    # Relationships
    rule = relationship("DetectionRule")
    agent = relationship("Agent")
    host = relationship("Host")
    detection_results = relationship("DetectionResult", back_populates="alert")
