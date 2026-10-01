import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import FrozenSet


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class AgentConfig:
    collector_host: str = "127.0.0.1"
    collector_port: int = 5000
    collector_scheme: str = "http"
    agent_auth: str = ""
    agent_id: str = ""
    hostname: str = ""
    agent_version: str = "0.1.0"
    collection_interval: float = 15.0
    heartbeat_interval: float = 30.0
    enabled_sources: FrozenSet[str] = field(default_factory=frozenset)
    buffer_path: Path = Path(".soc-agent-spool.json")
    buffer_size: int = 1000
    retry_attempts: int = 3
    retry_backoff: float = 1.0
    request_timeout: float = 10.0
    tls_verify: bool = True

    @property
    def base_url(self) -> str:
        return f"{self.collector_scheme}://{self.collector_host}:{self.collector_port}/api/v1/agent"

    @classmethod
    def from_environment(cls, prefix: str = "SOC_AGENT_") -> "AgentConfig":
        sources = os.getenv(f"{prefix}ENABLED_SOURCES", "")
        default_spool = Path.home() / ".soc-monitor" / "agent-spool.json"
        return cls(
            collector_host=os.getenv(f"{prefix}COLLECTOR_HOST", "127.0.0.1"),
            collector_port=int(os.getenv(f"{prefix}COLLECTOR_PORT", "5000")),
            collector_scheme=os.getenv(f"{prefix}COLLECTOR_SCHEME", "http"),
            agent_auth=os.getenv(f"{prefix}AGENT_AUTH", ""),
            agent_id=os.getenv(f"{prefix}AGENT_ID", ""),
            hostname=os.getenv(f"{prefix}HOSTNAME", ""),
            agent_version=os.getenv(f"{prefix}AGENT_VERSION", "0.1.0"),
            collection_interval=float(os.getenv(f"{prefix}COLLECTION_INTERVAL", "15")),
            heartbeat_interval=float(os.getenv(f"{prefix}HEARTBEAT_INTERVAL", "30")),
            enabled_sources=frozenset(item.strip() for item in sources.split(",") if item.strip()),
            buffer_path=Path(os.getenv(f"{prefix}BUFFER_PATH", str(default_spool))),
            buffer_size=int(os.getenv(f"{prefix}BUFFER_SIZE", "1000")),
            retry_attempts=int(os.getenv(f"{prefix}RETRY_ATTEMPTS", "3")),
            retry_backoff=float(os.getenv(f"{prefix}RETRY_BACKOFF", "1")),
            request_timeout=float(os.getenv(f"{prefix}REQUEST_TIMEOUT", "10")),
            tls_verify=_as_bool(os.getenv(f"{prefix}TLS_VERIFY"), True),
        )
