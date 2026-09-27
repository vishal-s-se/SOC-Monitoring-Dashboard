import asyncio
import logging
from typing import Callable, Awaitable, List

logger = logging.getLogger(__name__)

class InternalEventBus:
    """Lightweight in-memory event bus for Phase 6A."""
    
    def __init__(self):
        self._subscribers: List[Callable[[dict], Awaitable[None]]] = []
        self._queues = {}
        self._tasks = {}

    def _get_queue(self):
        loop = asyncio.get_running_loop()
        if loop not in self._queues:
            self._queues[loop] = asyncio.Queue()
        return self._queues[loop]

    def start(self):
        """Start the background task to process events."""
        loop = asyncio.get_running_loop()
        if loop not in self._tasks:
            self._tasks[loop] = asyncio.create_task(self._process_events())

    def stop(self):
        """Stop processing."""
        loop = asyncio.get_running_loop()
        task = self._tasks.get(loop)
        if task:
            task.cancel()
            del self._tasks[loop]
        if loop in self._queues:
            del self._queues[loop]

    def subscribe(self, callback: Callable[[dict], Awaitable[None]]):
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[dict], Awaitable[None]]):
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    async def publish(self, event_type: str, data: dict):
        from datetime import datetime, timezone
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
                for sub in self._subscribers:
                    try:
                        await sub(event)
                    except Exception as e:
                        logger.error(f"Error in event subscriber: {e}")
                self._get_queue().task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error processing internal event: {e}")

# Global instance for the monolithic backend
event_bus = InternalEventBus()
