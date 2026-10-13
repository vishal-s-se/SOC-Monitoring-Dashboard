from sqlalchemy import Column, String, DateTime, Integer, func
from backend.app.db.base_class import Base

class ViewClearMarker(Base):
    __tablename__ = "view_clear_marker"

    id = Column(Integer, primary_key=True, index=True)
    operating_system = Column(String, index=True, nullable=False)
    category = Column(String, index=True, nullable=False)
    last_cleared_event_id = Column(Integer, nullable=False, default=0)
    cleared_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    cleared_by = Column(String, nullable=True)
