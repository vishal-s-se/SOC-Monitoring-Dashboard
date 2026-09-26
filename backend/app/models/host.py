from sqlalchemy import Column, String, DateTime, func, Integer
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class Host(Base):
    id = Column(Integer, primary_key=True, index=True)
    host_identifier = Column(String, unique=True, index=True, nullable=False)
    hostname = Column(String, index=True, nullable=False)
    operating_system = Column(String, nullable=True)
    os_version = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    status = Column(String, default="ONLINE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_seen = Column(DateTime(timezone=True), nullable=True)

    agents = relationship("Agent", back_populates="host", cascade="all, delete-orphan")
    raw_logs = relationship("RawLog", back_populates="host")
    events = relationship("Event", back_populates="host")
    heartbeats = relationship("Heartbeat", back_populates="host")
