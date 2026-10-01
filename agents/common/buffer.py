import json
import os
from pathlib import Path
from typing import Iterator

from .events import AgentEvent


class BufferFull(Exception):
    pass


class PersistentEventBuffer:
    def __init__(self, path: Path, max_events: int = 1000):
        self.path = Path(path)
        self.max_events = max_events
        self._items: list[AgentEvent] = []
        self._load()

    def __len__(self) -> int:
        return len(self._items)

    def enqueue(self, event: AgentEvent) -> None:
        if any(item.event_id == event.event_id for item in self._items):
            return
        if len(self._items) >= self.max_events:
            raise BufferFull(f"event buffer limit reached: {self.max_events}")
        self._items.append(event)
        self._save()

    def peek(self) -> AgentEvent | None:
        return self._items[0] if self._items else None

    def acknowledge(self, event_id: str) -> None:
        self._items = [item for item in self._items if item.event_id != event_id]
        self._save()

    def __iter__(self) -> Iterator[AgentEvent]:
        return iter(tuple(self._items))

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            records = json.loads(self.path.read_text(encoding="utf-8"))
            self._items = [AgentEvent.from_payload(item) for item in records][-self.max_events :]
        except (OSError, ValueError, KeyError, TypeError):
            self._items = []

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(json.dumps([item.to_payload() for item in self._items]), encoding="utf-8")
        os.replace(temporary, self.path)
