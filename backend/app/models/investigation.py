from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum, UniqueConstraint, func
from sqlalchemy.orm import relationship
import enum
from backend.app.db.base_class import Base

class InvestigationStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"

class InvestigationSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class EvidenceType(str, enum.Enum):
    ALERT = "ALERT"
    EVENT = "EVENT"
    RAW_LOG = "RAW_LOG"
    HOST = "HOST"
    AGENT = "AGENT"

class Investigation(Base):
    __tablename__ = "investigation"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, default=InvestigationStatus.OPEN.value, index=True)
    severity = Column(String, default=InvestigationSeverity.MEDIUM.value, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    assigned_to = Column(String, nullable=True)
    resolution = Column(Text, nullable=True)

    evidence = relationship("InvestigationEvidence", back_populates="investigation", cascade="all, delete-orphan")
    notes = relationship("InvestigationNote", back_populates="investigation", cascade="all, delete-orphan")

class InvestigationEvidence(Base):
    __tablename__ = "investigation_evidence"

    id = Column(Integer, primary_key=True, index=True)
    investigation_id = Column(Integer, ForeignKey("investigation.id", ondelete="CASCADE"), nullable=False)
    evidence_type = Column(String, nullable=False, index=True)
    reference_id = Column(String, nullable=False, index=True) # Stored as string to support different ID types if needed (or int casted to str)
    added_at = Column(DateTime(timezone=True), server_default=func.now())
    added_by = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    investigation = relationship("Investigation", back_populates="evidence")

    __table_args__ = (
        UniqueConstraint('investigation_id', 'evidence_type', 'reference_id', name='uq_investigation_evidence'),
    )

class InvestigationNote(Base):
    __tablename__ = "investigation_note"

    id = Column(Integer, primary_key=True, index=True)
    investigation_id = Column(Integer, ForeignKey("investigation.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    author = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    investigation = relationship("Investigation", back_populates="notes")
