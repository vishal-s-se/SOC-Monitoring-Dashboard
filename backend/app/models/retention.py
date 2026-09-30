from sqlalchemy import Column, Integer, String, DateTime, func, JSON, Boolean
from backend.app.db.base_class import Base
from sqlalchemy.dialects.postgresql import JSONB

class RetentionPolicy(Base):
    id = Column(Integer, primary_key=True, index=True)
    raw_logs_days = Column(Integer, default=7)
    normalized_events_days = Column(Integer, default=30)
    detection_results_days = Column(Integer, default=90)
    alerts_days = Column(Integer, default=90)
    behavioral_data_days = Column(Integer, default=90)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by = Column(String, nullable=True)

class CleanupAuditLog(Base):
    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    initiated_by = Column(String)
    is_manual = Column(Boolean, default=False)
    is_dry_run = Column(Boolean, default=False)
    status = Column(String)  # RUNNING, SUCCESS, FAILED, PARTIAL
    records_examined = Column(Integer, default=0)
    records_deleted = Column(Integer, default=0)
    records_skipped = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    duration_seconds = Column(Integer, default=0)
    details = Column(JSONB, nullable=True)
