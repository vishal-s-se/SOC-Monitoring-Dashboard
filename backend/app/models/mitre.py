from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
import enum
from backend.app.db.base_class import Base

class MitreTargetType(str, enum.Enum):
    DETECTION_RULE = "DETECTION_RULE"
    ALERT = "ALERT"
    INVESTIGATION = "INVESTIGATION"
    EVENT = "EVENT"

class MitreMappingSource(str, enum.Enum):
    SYSTEM_DEFINED = "SYSTEM_DEFINED"
    ANALYST_CONFIRMED = "ANALYST_CONFIRMED"
    DOCUMENTED_RULE = "DOCUMENTED_RULE"
    IMPORTED = "IMPORTED"

class MitreConfidence(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class MitreTactic(Base):
    __tablename__ = "mitre_tactic"

    id = Column(Integer, primary_key=True, index=True)
    tactic_id = Column(String, unique=True, index=True, nullable=False) # e.g. TA0001
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    external_url = Column(String, nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    techniques = relationship("MitreTechniqueTactic", back_populates="tactic", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("tactic_id", name="uq_mitre_tactic_tactic_id"),
    )

class MitreTechnique(Base):
    __tablename__ = "mitre_technique"

    id = Column(Integer, primary_key=True, index=True)
    technique_id = Column(String, unique=True, index=True, nullable=False) # e.g. T1059 or T1059.001
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_subtechnique = Column(Boolean, default=False, nullable=False)
    parent_technique_id = Column(String, ForeignKey("mitre_technique.technique_id", ondelete="SET NULL"), nullable=True, index=True)
    platforms = Column(JSONB, nullable=True) # e.g. ["Windows", "Linux", "macOS"]
    data_sources = Column(JSONB, nullable=True) # e.g. ["Process Creation", "Command Execution"]
    is_deprecated = Column(Boolean, default=False, nullable=False)
    dataset_version = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tactics = relationship("MitreTechniqueTactic", back_populates="technique", cascade="all, delete-orphan")
    mappings = relationship("MitreMapping", back_populates="technique", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("technique_id", name="uq_mitre_technique_technique_id"),
    )

class MitreTechniqueTactic(Base):
    __tablename__ = "mitre_technique_tactic"

    id = Column(Integer, primary_key=True, index=True)
    technique_id = Column(String, ForeignKey("mitre_technique.technique_id", ondelete="CASCADE"), nullable=False, index=True)
    tactic_id = Column(String, ForeignKey("mitre_tactic.tactic_id", ondelete="CASCADE"), nullable=False, index=True)

    technique = relationship("MitreTechnique", back_populates="tactics")
    tactic = relationship("MitreTactic", back_populates="techniques")

    __table_args__ = (
        UniqueConstraint("technique_id", "tactic_id", name="uq_technique_tactic"),
    )

class MitreMapping(Base):
    __tablename__ = "mitre_mapping"

    id = Column(Integer, primary_key=True, index=True)
    technique_id = Column(String, ForeignKey("mitre_technique.technique_id", ondelete="CASCADE"), nullable=False, index=True)
    target_type = Column(String, nullable=False, index=True) # MitreTargetType: DETECTION_RULE, ALERT, INVESTIGATION, EVENT
    target_id = Column(String, nullable=False, index=True) # ID as string to match any entity ID
    mapping_source = Column(String, default=MitreMappingSource.SYSTEM_DEFINED.value, nullable=False) # MitreMappingSource
    confidence = Column(String, default=MitreConfidence.MEDIUM.value, nullable=False) # MitreConfidence: LOW, MEDIUM, HIGH
    evidence_reference = Column(String, nullable=True) # e.g. "Alert #42", "Event #1052"
    notes = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    technique = relationship("MitreTechnique", back_populates="mappings")

    __table_args__ = (
        UniqueConstraint("technique_id", "target_type", "target_id", name="uq_mitre_mapping"),
    )
