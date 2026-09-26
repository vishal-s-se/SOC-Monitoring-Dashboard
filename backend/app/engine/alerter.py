import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.models.detection import DetectionRule, DetectionResult
from backend.app.models.alert import Alert
from backend.app.models.event import Event

logger = logging.getLogger(__name__)

class AlertService:
    @staticmethod
    def generate_fingerprint(rule: DetectionRule, event: Event) -> str:
        """
        Generate a deterministic deduplication key for an alert.
        We group alerts by Rule ID and Agent ID (or hostname if agent is missing).
        """
        target = str(event.agent_id) if event.agent_id else event.hostname or "unknown"
        return f"{rule.rule_id}:{target}"

    @staticmethod
    async def process_detection(db: AsyncSession, detection: DetectionResult, rule: DetectionRule, event: Event) -> Alert:
        """
        Process a detection result and either create a new Alert or update an existing one.
        """
        fingerprint = AlertService.generate_fingerprint(rule, event)
        
        # Check for an active (OPEN or ACKNOWLEDGED) alert with this fingerprint
        stmt = select(Alert).where(
            Alert.fingerprint == fingerprint,
            Alert.status.in_(["OPEN", "ACKNOWLEDGED"])
        )
        result = await db.execute(stmt)
        existing_alert = result.scalars().first()
        
        if existing_alert:
            # Duplicate detection -> update occurrence
            existing_alert.occurrence_count += 1
            existing_alert.last_seen = datetime.now(timezone.utc)
            detection.alert_id = existing_alert.id
            detection.status = "PROCESSED"
            db.add(existing_alert)
            db.add(detection)
            return existing_alert
            
        # No active alert, create a new one
        new_alert = Alert(
            alert_id=str(uuid.uuid4()),
            title=f"Alert: {rule.name}",
            description=f"Detection for {rule.name} triggered on {event.hostname or 'unknown'}",
            severity=rule.severity,
            status="OPEN",
            fingerprint=fingerprint,
            rule_id=rule.id,
            agent_id=event.agent_id,
            host_id=event.host_id,
            metadata_={
                "rule_name": rule.name,
                "first_event_id": event.event_id
            }
        )
        db.add(new_alert)
        await db.flush() # flush to get new_alert.id
        
        detection.alert_id = new_alert.id
        detection.status = "PROCESSED"
        db.add(detection)
        
        return new_alert

    @staticmethod
    async def acknowledge_alert(db: AsyncSession, alert_id: str) -> Optional[Alert]:
        stmt = select(Alert).where(Alert.alert_id == alert_id)
        result = await db.execute(stmt)
        alert = result.scalars().first()
        
        if alert and alert.status == "OPEN":
            alert.status = "ACKNOWLEDGED"
            db.add(alert)
        return alert

    @staticmethod
    async def resolve_alert(db: AsyncSession, alert_id: str) -> Optional[Alert]:
        stmt = select(Alert).where(Alert.alert_id == alert_id)
        result = await db.execute(stmt)
        alert = result.scalars().first()
        
        if alert and alert.status in ["OPEN", "ACKNOWLEDGED"]:
            alert.status = "RESOLVED"
            db.add(alert)
        return alert
