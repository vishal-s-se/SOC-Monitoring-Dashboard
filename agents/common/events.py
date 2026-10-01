import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .identity import AgentIdentity


@dataclass(frozen=True)
class AgentEvent:
    event_id: str
    agent_id: str
    hostname: str
    operating_system: str
    timestamp: datetime
    event_type: str
    source: str
    payload: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        identity: AgentIdentity,
        event_type: str,
        source: str,
        payload: str,
        timestamp: datetime | None = None,
        event_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "AgentEvent":
        return cls(
            event_id=event_id or str(uuid.uuid4()),
            agent_id=identity.agent_id,
            hostname=identity.hostname,
            operating_system=identity.operating_system,
            timestamp=timestamp or datetime.now(timezone.utc),
            event_type=event_type,
            source=source,
            payload=payload,
            metadata=metadata or {},
        )

    def to_payload(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "agent_id": self.agent_id,
            "hostname": self.hostname,
            "operating_system": self.operating_system,
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type,
            "source": self.source,
            "payload": self.payload,
            "metadata": self.metadata,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_payload(), separators=(",", ":"), sort_keys=True)

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "AgentEvent":
        return cls(
            event_id=str(payload["event_id"]),
            agent_id=str(payload["agent_id"]),
            hostname=str(payload["hostname"]),
            operating_system=str(payload.get("operating_system") or "unknown"),
            timestamp=datetime.fromisoformat(str(payload["timestamp"]).replace("Z", "+00:00")),
            event_type=str(payload["event_type"]),
            source=str(payload["source"]),
            payload=str(payload["payload"]),
            metadata=dict(payload.get("metadata") or {}),
        )
