from sqlalchemy import Column, String, DateTime, func, Integer, Boolean
from backend.app.db.base_class import Base

class EnrollmentCode(Base):
    id = Column(Integer, primary_key=True, index=True)
    code_hash = Column(String, unique=True, index=True, nullable=False)
    target_os = Column(String, nullable=True)  # windows or linux
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
