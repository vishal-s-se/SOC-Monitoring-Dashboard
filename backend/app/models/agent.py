from sqlalchemy import Column, String, DateTime, func, Integer, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from backend.app.db.base_class import Base

class Agent(Base):
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(String, unique=True, index=True, nullable=False)
    host_id = Column(Integer, ForeignKey("host.id"), nullable=False)
    hostname = Column(String, nullable=True)
    operating_system = Column(String, nullable=True)
    agent_version = Column(String, nullable=True)
    status = Column(String, default="OFFLINE")
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), nullable=True)
    ip_address = Column(String, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)  # Using metadata_ to avoid conflict with SQLAlchemy's metadata

    host = relationship("Host", back_populates="agents")
    raw_logs = relationship("RawLog", back_populates="agent")
    events = relationship("Event", back_populates="agent")
    heartbeats = relationship("Heartbeat", back_populates="agent")
