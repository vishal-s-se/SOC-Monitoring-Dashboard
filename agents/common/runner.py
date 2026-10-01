import logging
import time
from collections.abc import Callable, Iterable

from .buffer import BufferFull, PersistentEventBuffer
from .client import AgentClient
from .events import AgentEvent

logger = logging.getLogger(__name__)


class AgentRunner:
    def __init__(self, client: AgentClient, buffer: PersistentEventBuffer, sources: Iterable[Callable[[], Iterable[AgentEvent]]]):
        self.client = client
        self.buffer = buffer
        self.sources = tuple(sources)

    def run_once(self) -> int:
        collected = 0
        for source in self.sources:
            try:
                for event in source():
                    self.buffer.enqueue(event)
                    collected += 1
            except BufferFull:
                logger.error("event buffer is full; collection paused until delivery recovers")
            except Exception:
                logger.exception("event source failed")
        self.flush()
        return collected

    def flush(self) -> int:
        delivered = 0
        while (event := self.buffer.peek()) is not None:
            try:
                self.client.send_event(event)
            except Exception:
                logger.warning("collector unavailable; retaining buffered events")
                break
            self.buffer.acknowledge(event.event_id)
            delivered += 1
        return delivered

    def run_forever(self, stop: Callable[[], bool] | None = None) -> None:
        self.client.register()
        last_heartbeat = 0.0
        while not stop or not stop():
            now = time.monotonic()
            if now - last_heartbeat >= self.client.config.heartbeat_interval:
                self.client.heartbeat()
                last_heartbeat = now
            self.run_once()
            time.sleep(self.client.config.collection_interval)
