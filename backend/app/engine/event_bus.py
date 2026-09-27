import asyncio
import logging
from typing import Callable, Awaitable, List

logger = logging.getLogger(__name__)

class InternalEventBus:
    """Lightweight in-memory event bus for Phase 6A."""
    
    def __init__(self):
        self._subscribers: List[Callable[[dict], Awaitable[None]]] = []
        # Queue isn't strictly necessary if we just await callbacks, but queue decouples them.
        self._queue = asyncio.Queue()
        self._task = None

    def start(self):
        """Start the background task to process events."""
        if not self._task:
            self._task = asyncio.create_task(self._process_events())

    def stop(self):
        """Stop processing."""
        if self._task:
            self._task.cancel()
            self._task = None

    def subscribe(self, callback: Callable[[dict], Awaitable[None]]):
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[dict], Awaitable[None]]):
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    async def publish(self, event_type: str, data: dict):
        event = {
            "type": event_type,
            "data": data
        }
        await self._queue.put(event)

    async def _process_events(self):
        while True:
            try:
                event = await self._queue.get()
                for sub in self._subscribers:
                    try:
                        await sub(event)
                    except Exception as e:
                        logger.error(f"Error in event subscriber: {e}")
                self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error processing internal event: {e}")

# Global instance for the monolithic backend
event_bus = InternalEventBus()
