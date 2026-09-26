from sqlalchemy import Column, String, DateTime, func, Integer, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base_class import Base

class Event(Base):
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, unique=True, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), index=True, nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    host_id = Column(Integer, ForeignKey("host.id"), nullable=True)
    agent_id = Column(Integer, ForeignKey("agent.id"), nullable=True)
    hostname = Column(String, nullable=True)
    operating_system = Column(String, nullable=True)
    source_type = Column(String, index=True, nullable=True)
    event_category = Column(String, index=True, nullable=True)
    event_type = Column(String, index=True, nullable=True)
    username = Column(String, index=True, nullable=True)
    source_ip = Column(String, index=True, nullable=True)
    destination_ip = Column(String, index=True, nullable=True)
    source_port = Column(Integer, nullable=True)
    destination_port = Column(Integer, nullable=True)
    protocol = Column(String, index=True, nullable=True)
    action = Column(String, index=True, nullable=True)
    severity = Column(String, index=True, nullable=True)
    raw_log_id = Column(Integer, ForeignKey("raw_log.id"), nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)

    host = relationship("Host", back_populates="events")
    agent = relationship("Agent", back_populates="events")
    raw_log = relationship("RawLog", back_populates="normalized_event")
