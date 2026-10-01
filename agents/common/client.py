import logging
import time
from datetime import datetime, timezone

from .config import AgentConfig
from .events import AgentEvent
from .identity import AgentIdentity
from .transport import CollectorTransport, TransportError

logger = logging.getLogger(__name__)


class AgentClient:
    def __init__(self, config: AgentConfig, identity: AgentIdentity, transport: CollectorTransport | None = None):
        self.config = config
        self.identity = identity
        self.transport = transport or CollectorTransport(config)

    def register(self) -> dict:
        return self._post_with_retry("register", {
            "agent_id": self.identity.agent_id,
            "hostname": self.identity.hostname,
            "operating_system": self.identity.operating_system,
            "agent_version": self.identity.agent_version,
            "ip_address": self.identity.ip_address,
            "metadata": self.identity.metadata(),
        })

    def heartbeat(self, status: str = "ONLINE") -> dict:
        return self._post_with_retry("heartbeat", {
            "agent_id": self.identity.agent_id,
            "hostname": self.identity.hostname,
            "agent_version": self.identity.agent_version,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "connection_status": status,
            "ip_address": self.identity.ip_address,
            "metadata": self.identity.metadata(),
        })

    def send_event(self, event: AgentEvent) -> dict:
        return self._post_with_retry("events", event.to_payload())

    def _post_with_retry(self, path: str, payload: dict) -> dict:
        last_error: TransportError | None = None
        for attempt in range(self.config.retry_attempts + 1):
            try:
                return self.transport.post(path, payload)
            except TransportError as exc:
                last_error = exc
                if attempt >= self.config.retry_attempts:
                    break
                time.sleep(self.config.retry_backoff * (2**attempt))
                logger.warning("collector request failed; retry %s/%s", attempt + 1, self.config.retry_attempts)
        raise last_error or TransportError("collector request failed")
