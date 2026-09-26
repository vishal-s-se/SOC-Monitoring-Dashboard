from sqlalchemy import Column, String, DateTime, func, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from backend.app.db.base_class import Base

class RawLog(Base):
    __tablename__ = "raw_log"
    id = Column(Integer, primary_key=True, index=True)
    event_identifier = Column(String, unique=True, index=True, nullable=False)
    host_id = Column(Integer, ForeignKey("host.id"), nullable=True)
    agent_id = Column(Integer, ForeignKey("agent.id"), nullable=True)
    source_type = Column(String, index=True, nullable=False)
    source_name = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), index=True, nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    raw_payload = Column(Text, nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=True)
    ingestion_status = Column(String, default="PENDING")

    host = relationship("Host", back_populates="raw_logs")
    agent = relationship("Agent", back_populates="raw_logs")
    normalized_event = relationship("Event", back_populates="raw_log", uselist=False)
