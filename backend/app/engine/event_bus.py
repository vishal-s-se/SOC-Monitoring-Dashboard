import asyncio
import logging
import json
from typing import Callable, Awaitable, List, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.db.session import SessionLocal
from backend.app.models.event import Event
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class BaseTransport:
    async def start(self, event_bus): pass
    async def stop(self): pass
    async def publish(self, event_type: str, data: dict): pass

class InMemoryTransport(BaseTransport):
    def __init__(self):
        self._queues = {}
        self._tasks = {}
        self._event_bus = None

    def _get_queue(self):
        loop = asyncio.get_running_loop()
        if loop not in self._queues:
            self._queues[loop] = asyncio.Queue()
        return self._queues[loop]

    async def start(self, event_bus):
        self._event_bus = event_bus
        loop = asyncio.get_running_loop()
        if loop not in self._tasks:
            self._tasks[loop] = asyncio.create_task(self._process_events())

    async def stop(self):
        loop = asyncio.get_running_loop()
        task = self._tasks.get(loop)
        if task:
            task.cancel()
            del self._tasks[loop]
        if loop in self._queues:
            del self._queues[loop]

    async def publish(self, event_type: str, data: dict):
        event = {
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data
        }
        await self._get_queue().put(event)

    async def _process_events(self):
        while True:
            try:
                event = await self._get_queue().get()
                if self._event_bus:
                    await self._event_bus._dispatch(event)
                self._get_queue().task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error processing internal event: {e}")

class DBPollingTransport(BaseTransport):
    def __init__(self):
        self._task = None
        self._event_bus = None
        self._last_event_id = 0

    async def start(self, event_bus):
        self._event_bus = event_bus
        loop = asyncio.get_running_loop()
        
        # Initialize last_event_id to current max so we only process new events
        try:
            async with SessionLocal() as db:
                result = await db.execute(select(Event).order_by(Event.id.desc()).limit(1))
                latest = result.scalars().first()
                if latest:
                    self._last_event_id = latest.id
        except Exception as e:
            logger.error(f"Failed to initialize DBPollingTransport watermark: {e}")

        self._task = asyncio.create_task(self._poll_db())

    async def stop(self):
        if self._task:
            self._task.cancel()
            self._task = None

    async def publish(self, event_type: str, data: dict):
        # We only rely on DB polling for cross-process "new_event". 
        # For other local events like "new_alert" or internal metrics, 
        # we can just dispatch them locally or rely on DB insertion.
        # But to be safe and preserve local behavior for alerts:
        event = {
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data
        }
        if self._event_bus:
            # Dispatch locally for events generated in the same process
            # "new_event" published by collector won't reach backend via this direct dispatch,
            # but that's exactly why we poll the DB in the backend!
            # We don't double-dispatch "new_event" if it was polled, because the poller directly calls _dispatch
            if event_type != "new_event":
                await self._event_bus._dispatch(event)

    async def _poll_db(self):
        while True:
            try:
                await asyncio.sleep(2.0) # Poll interval
                async with SessionLocal() as db:
                    result = await db.execute(
                        select(Event).where(Event.id > self._last_event_id).order_by(Event.id.asc()).limit(100)
                    )
                    events = result.scalars().all()
                    for ev in events:
                        self._last_event_id = max(self._last_event_id, ev.id)
                        data = {
                            "id": ev.id,
                            "event_id": ev.event_id,
                            "agent_id": ev.agent_id,
                            "host_id": ev.host_id,
                            "hostname": ev.hostname,
                            "operating_system": ev.operating_system,
                            "event_category": ev.event_category,
                            "event_type": ev.event_type,
                            "source": ev.source_type,
                            "username": ev.username,
                            "action": ev.action,
                            "source_ip": ev.source_ip,
                            "destination_ip": ev.destination_ip,
                            "source_port": ev.source_port,
                            "destination_port": ev.destination_port,
                            "protocol": ev.protocol,
                            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
                            "severity": ev.severity,
                        }
                        event_payload = {
                            "type": "new_event",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "data": data
                        }
                        if self._event_bus:
                            await self._event_bus._dispatch(event_payload)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in DB polling transport: {e}")

class EventBus:
    """Event bus with configurable transport layer."""
    def __init__(self, transport: BaseTransport = None):
        self._subscribers: List[Callable[[dict], Awaitable[None]]] = []
        self._transport = transport or InMemoryTransport()

    def set_transport(self, transport: BaseTransport):
        self._transport = transport

    def start(self):
        asyncio.create_task(self._transport.start(self))

    def stop(self):
        asyncio.create_task(self._transport.stop())

    def subscribe(self, callback: Callable[[dict], Awaitable[None]]):
        if callback not in self._subscribers:
            self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[dict], Awaitable[None]]):
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    async def publish(self, event_type: str, data: dict):
        await self._transport.publish(event_type, data)

    async def _dispatch(self, event: dict):
        for sub in self._subscribers:
            try:
                await sub(event)
            except Exception as e:
                logger.error(f"Error in event subscriber: {e}")

# Global instance
event_bus = EventBus(transport=DBPollingTransport())
