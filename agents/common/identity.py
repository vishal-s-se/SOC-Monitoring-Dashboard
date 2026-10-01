import platform
import socket
import uuid
from dataclasses import dataclass
from pathlib import Path

from .config import AgentConfig


@dataclass(frozen=True)
class AgentIdentity:
    agent_id: str
    hostname: str
    operating_system: str
    os_version: str
    agent_version: str
    ip_address: str | None

    @classmethod
    def load(cls, config: AgentConfig, state_path: Path | None = None) -> "AgentIdentity":
        state_path = state_path or config.buffer_path.with_name("agent-id")
        agent_id = config.agent_id.strip()
        if not agent_id and state_path.exists():
            agent_id = state_path.read_text(encoding="utf-8").strip()
        if not agent_id:
            agent_id = str(uuid.uuid4())
            state_path.parent.mkdir(parents=True, exist_ok=True)
            state_path.write_text(agent_id, encoding="utf-8")
        hostname = config.hostname.strip() or socket.gethostname()
        ip_address = _local_ip(hostname)
        return cls(
            agent_id=agent_id,
            hostname=hostname,
            operating_system=platform.system().lower() or "unknown",
            os_version=platform.release(),
            agent_version=config.agent_version,
            ip_address=ip_address,
        )

    def metadata(self) -> dict[str, str]:
        return {"os_version": self.os_version}


def _local_ip(hostname: str) -> str | None:
    try:
        return socket.gethostbyname(hostname)
    except OSError:
        return None
