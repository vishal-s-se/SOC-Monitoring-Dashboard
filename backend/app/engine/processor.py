import logging
from sqlalchemy.future import select
from backend.app.db.session import SessionLocal
from backend.app.models.event import Event
from backend.app.models.detection import DetectionRule
from backend.app.models.alert import Alert
from backend.app.engine.core import DetectionEngine
from backend.app.engine.event_bus import event_bus
from backend.app.engine.alerter import AlertService
import asyncio
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class DetectionProcessor:
    def __init__(self):
        self._engine = None

    async def _load_rules(self):
        async with SessionLocal() as db:
            result = await db.execute(select(DetectionRule).where(DetectionRule.enabled == True))
            rules = result.scalars().all()
            self._engine = DetectionEngine(list(rules))

    async def handle_new_event(self, bus_event: dict):
        if bus_event.get("type") != "new_event":
            return
        
        data = bus_event.get("data", {})
        
        # Reload rules periodically or just once? For now just once, or lazy load.
        if not self._engine:
            await self._load_rules()

        # Build an Event ORM stub from the dict data
        # Note: we don't save this stub, we just use it for evaluation
        ev = Event(
            id=data.get("id", 0),
            event_id=data.get("event_id"),
            timestamp=datetime.fromisoformat(data.get("timestamp").replace('Z', '+00:00')) if data.get("timestamp") else datetime.now(timezone.utc),
            agent_id=data.get("agent_id"),
            host_id=data.get("host_id"),
            hostname=data.get("hostname"),
            operating_system=data.get("operating_system"),
            source_type=data.get("source"),
            event_category=data.get("event_category"),
            event_type=data.get("event_type"),
            username=data.get("username"),
            source_ip=data.get("source_ip"),
            destination_ip=data.get("destination_ip"),
            source_port=data.get("source_port"),
            destination_port=data.get("destination_port"),
            protocol=data.get("protocol"),
            action=data.get("action"),
            severity=data.get("severity"),
        )
        
        from backend.app.engine.correlation import correlation_engine
        
        async with SessionLocal() as db:
            results = self._engine.evaluate_event(ev)
            synthetic_events = await correlation_engine.correlate(db, ev)
            for syn_ev in synthetic_events:
                results.extend(self._engine.evaluate_event(syn_ev))
            
            if results:
                for res in results:
                    # Find rule
                    rule = next((r for r in self._engine.rules if r.id == res.rule_id), None)
                    if not rule:
                        continue
                    
                    fingerprint = AlertService.generate_fingerprint(rule, ev)
                    
                    # Deduplication
                    existing = await db.execute(
                        select(Alert)
                        .where(Alert.rule_id == rule.id, Alert.status != "RESOLVED")
                        .order_by(Alert.last_seen.desc())
                        .limit(1)
                    )
                    alert = existing.scalar_one_or_none()
                    
                    if alert:
                        alert.occurrence_count += 1
                        alert.last_seen = datetime.now(timezone.utc)
                    else:
                        import uuid
                        alert = Alert(
                            alert_id=str(uuid.uuid4()),
                            rule_id=rule.id,
                            title=rule.name,
                            description=rule.description,
                            severity=rule.severity,
                            status="OPEN",
                            first_seen=datetime.now(timezone.utc),
                            last_seen=datetime.now(timezone.utc),
                            occurrence_count=1,
                            fingerprint=fingerprint
                        )
                        db.add(alert)
                    
                    db.add(res)
                
                await db.commit()
                
                # Publish new alerts
                for res in results:
                    await event_bus.publish("new_alert", {
                        "alert_id": res.id,
                        "rule_id": res.rule_id,
                        "status": res.status,
                        "severity": res.metadata_.get("severity", "HIGH")
                    })

detection_processor = DetectionProcessor()
