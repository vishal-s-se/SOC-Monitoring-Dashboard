from sqlalchemy import Column, String, DateTime, func, Integer, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from backend.app.db.base_class import Base

class Heartbeat(Base):
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agent.id"), nullable=False)
    host_id = Column(Integer, ForeignKey("host.id"), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True, nullable=False)
    status = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)
    agent_version = Column(String, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)

    host = relationship("Host", back_populates="heartbeats")
    agent = relationship("Agent", back_populates="heartbeats")
