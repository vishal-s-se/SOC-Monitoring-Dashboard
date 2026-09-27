import json
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import HTTPException

from backend.app.models.raw_log import RawLog
from backend.app.models.event import Event
from backend.app.models.agent import Agent
from collector.app.schemas import EventRequest
from collector.app.parser import parse_event_payload

logger = logging.getLogger(__name__)

async def process_event(event_req: EventRequest, agent: Agent, db: AsyncSession) -> dict:
    """
    Main processing pipeline for a received event:
    receive -> validate -> enrich -> raw persistence -> parse -> normalize -> normalized persistence
    """

    # 1. Validation is already handled partially by EventRequest schema.
    # 2. Enrich metadata
    collector_received_at = datetime.now(timezone.utc)
    enriched_metadata = event_req.metadata_ or {}
    enriched_metadata["collector_received_at"] = collector_received_at.isoformat()
    enriched_metadata["collector_id"] = "primary-collector"

    # 3. Raw Persistence
    raw_log = RawLog(
        event_identifier=event_req.event_id,
        host_id=agent.host_id,
        agent_id=agent.id,
        source_type=event_req.source,
        timestamp=event_req.timestamp,
        raw_payload=event_req.payload,
        metadata_=enriched_metadata,
        ingestion_status="PROCESSED"
    )

    db.add(raw_log)
    try:
        # We flush to get the raw_log.id, but we catch UniqueViolation if it's a duplicate.
        await db.flush()
    except Exception as e:
        await db.rollback()
        # Handle duplicate safely
        logger.info(f"Duplicate event ignored: {event_req.event_id}")
        return {"status": "ok", "message": "Duplicate event ignored"}

    # 4 & 5. Parse and Normalize
    normalized_fields = parse_event_payload(event_req.source, event_req.payload)

    # 6. Normalized Persistence
    # Merge extracted fields with envelope fields
    event = Event(
        event_id=event_req.event_id,
        timestamp=event_req.timestamp,
        received_at=collector_received_at,
        host_id=agent.host_id,
        agent_id=agent.id,
        hostname=event_req.hostname,
        operating_system=event_req.operating_system or agent.operating_system,
        source_type=event_req.source,
        raw_log_id=raw_log.id,
        metadata_=enriched_metadata,
        # Default fallback values for normalized fields
        event_category=normalized_fields.get("event_category", "unknown"),
        event_type=normalized_fields.get("event_type", event_req.event_type),
        username=normalized_fields.get("username"),
        source_ip=normalized_fields.get("source_ip"),
        destination_ip=normalized_fields.get("destination_ip"),
        source_port=normalized_fields.get("source_port"),
        destination_port=normalized_fields.get("destination_port"),
        protocol=normalized_fields.get("protocol"),
        action=normalized_fields.get("action"),
        severity=normalized_fields.get("severity", "INFO"),
    )

    db.add(event)
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to commit normalized event: {e}")
        raise HTTPException(status_code=500, detail="Database error during event normalization")

    from backend.app.engine.event_bus import event_bus
    await event_bus.publish("new_event", {
        "event_id": event.event_id,
        "agent_id": event.agent_id,
        "hostname": event.hostname,
        "operating_system": event.operating_system,
        "event_type": event.event_type,
        "source": event.source_type,
        "timestamp": event.timestamp.isoformat(),
        "severity": event.severity
    })

    return {"status": "ok", "message": "Event processed successfully"}
