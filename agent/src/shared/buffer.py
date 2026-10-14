import collections
import json
import logging
import os
import tempfile

logger = logging.getLogger(__name__)

class EventBuffer:
    def __init__(self, max_size=1000, persistence_path=None):
        if max_size < 1:
            raise ValueError("max_size must be positive")
        self.max_size = max_size
        self.persistence_path = persistence_path
        self.buffer = collections.deque(maxlen=max_size)
        self.discarded_count = 0
        self._load()

    def add(self, event):
        """Add an event to the buffer. Oldest events are dropped if max_size is reached."""
        was_full = len(self.buffer) == self.max_size
        self.buffer.append(event)
        if was_full:
            self.discarded_count += 1
            logger.warning(
                f"Event buffer capacity ({self.max_size}) exceeded; oldest event discarded. Total discarded: {self.discarded_count}"
            )
        self._persist()

    def get_all(self):
        """Retrieve all events currently in the buffer."""
        return list(self.buffer)

    def clear(self):
        """Clear the buffer."""
        self.buffer.clear()
        self._persist()

    def discard_prefix(self, count):
        """Discard only events already acknowledged by the collector."""
        for _ in range(min(count, len(self.buffer))):
            self.buffer.popleft()
        self._persist()

    def size(self):
        """Return the current size of the buffer."""
        return len(self.buffer)

    def is_empty(self):
        """Return True if the buffer is empty."""
        return len(self.buffer) == 0

    def get_stats(self):
        """Return buffer telemetry: current size, max size, and total discarded events."""
        return {
            "size": len(self.buffer),
            "max_size": self.max_size,
            "discarded_count": self.discarded_count,
            "is_full": len(self.buffer) >= self.max_size
        }

    def _load(self):
        if not self.persistence_path or not os.path.exists(self.persistence_path):
            return

        try:
            with open(self.persistence_path, "r", encoding="utf-8") as handle:
                for line in handle:
                    try:
                        self.buffer.append(json.loads(line))
                    except json.JSONDecodeError:
                        logger.warning("Ignoring malformed event buffer record")
        except OSError as error:
            logger.error("Failed to load event buffer: %s", error)

    def _persist(self):
        if not self.persistence_path:
            return

        parent = os.path.dirname(os.path.abspath(self.persistence_path))
        os.makedirs(parent, mode=0o700, exist_ok=True)
        fd, temp_path = tempfile.mkstemp(dir=parent, prefix="buffer-", text=True)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                for event in self.buffer:
                    handle.write(json.dumps(event, separators=(",", ":")) + "\n")
            os.chmod(temp_path, 0o600)
            os.replace(temp_path, self.persistence_path)
        except (OSError, TypeError, ValueError) as error:
            logger.error("Failed to persist event buffer: %s", error)
            if os.path.exists(temp_path):
                os.unlink(temp_path)
