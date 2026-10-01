import json
from pathlib import Path

import pytest

from agents.common.buffer import BufferFull, PersistentEventBuffer
from agents.common.client import AgentClient
from agents.common.config import AgentConfig
from agents.common.events import AgentEvent
from agents.common.identity import AgentIdentity
from agents.common.runner import AgentRunner
from agents.common.transport import TransportError


class FakeTransport:
    def __init__(self, failures=0):
        self.failures = failures
        self.calls = []

    def post(self, path, payload):
        self.calls.append((path, payload))
        if self.failures:
            self.failures -= 1
            raise TransportError("offline")
        return {"status": "ok"}


def identity(tmp_path: Path) -> AgentIdentity:
    return AgentIdentity("agent-1", "host-1", "linux", "test", "1.0", "127.0.0.1")


def event(tmp_path: Path, event_id="event-1") -> AgentEvent:
    return AgentEvent.create(identity(tmp_path), "authentication", "linux_auth", "raw", event_id=event_id)


def test_config_reads_secret_and_sources(monkeypatch, tmp_path):
    monkeypatch.setenv("SOC_AGENT_AGENT_AUTH", "secret")
    monkeypatch.setenv("SOC_AGENT_ENABLED_SOURCES", "auth, journald")
    monkeypatch.setenv("SOC_AGENT_BUFFER_PATH", str(tmp_path / "spool.json"))
    config = AgentConfig.from_environment()
    assert config.agent_auth == "secret"
    assert config.enabled_sources == {"auth", "journald"}


def test_buffer_persists_deduplicates_and_bounds(tmp_path):
    path = tmp_path / "spool.json"
    buffer = PersistentEventBuffer(path, max_events=1)
    buffer.enqueue(event(tmp_path))
    buffer.enqueue(event(tmp_path))
    with pytest.raises(BufferFull):
        buffer.enqueue(event(tmp_path, "event-2"))
    restored = PersistentEventBuffer(path, max_events=1)
    assert len(restored) == 1
    assert restored.peek().event_id == "event-1"


def test_client_posts_existing_collector_shapes(tmp_path):
    config = AgentConfig(agent_auth="secret", retry_attempts=0)
    transport = FakeTransport()
    client = AgentClient(config, identity(tmp_path), transport)
    client.register()
    client.heartbeat()
    client.send_event(event(tmp_path))
    assert [call[0] for call in transport.calls] == ["register", "heartbeat", "events"]
    assert transport.calls[0][1]["metadata"]["os_version"] == "test"
    assert json.loads(json.dumps(transport.calls[2][1]))["payload"] == "raw"


def test_client_retries_transient_transport_failure(tmp_path):
    config = AgentConfig(agent_auth="secret", retry_attempts=1, retry_backoff=0)
    transport = FakeTransport(failures=1)
    client = AgentClient(config, identity(tmp_path), transport)
    client.send_event(event(tmp_path))
    assert len(transport.calls) == 2


def test_runner_retains_events_when_collector_is_unavailable(tmp_path):
    config = AgentConfig(retry_attempts=0, buffer_path=tmp_path / "spool.json")
    transport = FakeTransport(failures=1)
    client = AgentClient(config, identity(tmp_path), transport)
    buffer = PersistentEventBuffer(config.buffer_path, max_events=10)
    runner = AgentRunner(client, buffer, [lambda: [event(tmp_path)]])
    assert runner.run_once() == 1
    assert len(buffer) == 1
