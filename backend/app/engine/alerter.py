import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.models.detection import DetectionRule, DetectionResult
from backend.app.models.alert import Alert
from backend.app.models.event import Event
from backend.app.engine.event_bus import event_bus

logger = logging.getLogger(__name__)

class AlertService:
    @staticmethod
    def generate_fingerprint(rule: DetectionRule, event: Event) -> str:
        target = str(event.agent_id) if event.agent_id else event.hostname or "unknown"
        return f"{rule.rule_id}:{target}"

    @staticmethod
    async def process_detection(db: AsyncSession, detection: DetectionResult, rule: DetectionRule, event: Event) -> Alert:
        fingerprint = AlertService.generate_fingerprint(rule, event)

        stmt = select(Alert).where(
            Alert.fingerprint == fingerprint,
            Alert.status.in_(["OPEN", "ACKNOWLEDGED"])
        )
        result = await db.execute(stmt)
        existing_alert = result.scalars().first()

        if existing_alert:
            existing_alert.occurrence_count += 1
            existing_alert.last_seen = datetime.now(timezone.utc)
            detection.alert_id = existing_alert.id
            detection.status = "PROCESSED"
            db.add(existing_alert)
            db.add(detection)

            await event_bus.publish("alert_updated", {
                "alert_id": existing_alert.alert_id,
                "status": existing_alert.status,
                "occurrence_count": existing_alert.occurrence_count
            })
            return existing_alert

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
        await db.flush()

        detection.alert_id = new_alert.id
        detection.status = "PROCESSED"
        db.add(detection)

        await event_bus.publish("new_alert", {
            "alert_id": new_alert.alert_id,
            "title": new_alert.title,
            "severity": new_alert.severity,
            "status": new_alert.status,
            "rule_id": rule.rule_id,
            "agent_id": event.agent_id
        })

        return new_alert

    @staticmethod
    async def acknowledge_alert(db: AsyncSession, alert_id: str) -> Optional[Alert]:
        stmt = select(Alert).where(Alert.alert_id == alert_id)
        result = await db.execute(stmt)
        alert = result.scalars().first()

        if alert and alert.status == "OPEN":
            alert.status = "ACKNOWLEDGED"
            db.add(alert)
            await event_bus.publish("alert_updated", {
                "alert_id": alert.alert_id,
                "status": alert.status
            })
        return alert

    @staticmethod
    async def resolve_alert(db: AsyncSession, alert_id: str) -> Optional[Alert]:
        stmt = select(Alert).where(Alert.alert_id == alert_id)
        result = await db.execute(stmt)
        alert = result.scalars().first()

        if alert and alert.status in ["OPEN", "ACKNOWLEDGED"]:
            alert.status = "RESOLVED"
            db.add(alert)
            await event_bus.publish("alert_updated", {
                "alert_id": alert.alert_id,
                "status": alert.status
            })
        return alert
