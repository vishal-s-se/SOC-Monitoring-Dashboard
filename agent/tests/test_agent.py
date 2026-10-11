import os
import time
import pytest
import responses
from unittest.mock import patch, MagicMock

from shared.config import Config
from shared.identity import Identity
from shared.buffer import EventBuffer
from shared.transport import Transport
from shared.heartbeat import HeartbeatThread

# --- Fixtures ---

@pytest.fixture
def mock_config(tmp_path):
    config_file = tmp_path / "agent.yml"
    config_file.write_text('''
collector:
  host: 127.0.0.1
  port: 5000
  tls: false
agent:
  id_file: agent_id.txt
  heartbeat_interval: 10
  buffer_max_events: 50
    ''')
    # Change working directory so id_file is created in tmp_path
    old_cwd = os.getcwd()
    os.chdir(tmp_path)
    cfg = Config(str(config_file))
    yield cfg
    os.chdir(old_cwd)

@pytest.fixture
def mock_identity():
    return Identity(id_file="dummy_id.txt")

@pytest.fixture
def empty_buffer():
    return EventBuffer(max_size=10)

# --- Tests ---

def test_config_loading(mock_config):
    assert mock_config.collector_url == "http://127.0.0.1:5000"
    assert mock_config.heartbeat_interval == 10
    assert mock_config.buffer_max_events == 50

def test_invalid_config_loading():
    with pytest.raises(FileNotFoundError):
        Config("nonexistent.yml")

def test_identity_creation(mock_identity):
    assert mock_identity.agent_id is not None
    assert mock_identity.hostname is not None
    assert mock_identity.os_type is not None

def test_stable_agent_id(tmp_path):
    id_file = tmp_path / "test_id.txt"
    identity1 = Identity(id_file=str(id_file))
    id1 = identity1.agent_id
    
    identity2 = Identity(id_file=str(id_file))
    id2 = identity2.agent_id
    
    assert id1 == id2

def test_buffer_behavior(empty_buffer):
    assert empty_buffer.is_empty()
    empty_buffer.add({"event": 1})
    assert empty_buffer.size() == 1
    
    # Test max size
    buf = EventBuffer(max_size=2)
    buf.add({"e": 1})
    buf.add({"e": 2})
    buf.add({"e": 3})
    
    events = buf.get_all()
    assert len(events) == 2
    assert events[0] == {"e": 2}
    assert events[1] == {"e": 3}

def test_buffer_restart_recovery(tmp_path):
    buffer_path = tmp_path / "event-buffer.jsonl"
    buffer = EventBuffer(max_size=2, persistence_path=str(buffer_path))
    buffer.add({"event": "offline"})

    restarted = EventBuffer(max_size=2, persistence_path=str(buffer_path))
    assert restarted.get_all() == [{"event": "offline"}]

@responses.activate
def test_buffer_flush_preserves_failed_events(mock_config, mock_identity, empty_buffer):
    transport = Transport(mock_config, mock_identity, empty_buffer)
    transport.registered = True
    empty_buffer.add({"event": 1})
    empty_buffer.add({"event": 2})

    responses.add(responses.POST, "http://127.0.0.1:5000/api/v1/agent/events", status=200)
    responses.add(responses.POST, "http://127.0.0.1:5000/api/v1/agent/events", status=503)

    transport.flush_buffer()

    assert empty_buffer.get_all() == [{"event": 2}]

def test_payload_validation(mock_config, mock_identity, empty_buffer):
    transport = Transport(mock_config, mock_identity, empty_buffer)
    with pytest.raises(ValueError):
        transport.send_event([])

@responses.activate
def test_registration_success(mock_config, mock_identity, empty_buffer):
    responses.add(
        responses.POST, 
        "http://127.0.0.1:5000/api/v1/agent/register",
        json={"status": "registered"},
        status=200
    )
    
    transport = Transport(mock_config, mock_identity, empty_buffer)
    result = transport.register(max_retries=1)
    
    assert result is True
    assert transport.registered is True

@responses.activate
def test_registration_failure(mock_config, mock_identity, empty_buffer):
    responses.add(
        responses.POST, 
        "http://127.0.0.1:5000/api/v1/agent/register",
        status=500
    )
    
    transport = Transport(mock_config, mock_identity, empty_buffer)
    result = transport.register(max_retries=2, retry_delay=0.01)
    
    assert result is False
    assert transport.registered is False

@responses.activate
def test_collector_unavailable_buffering(mock_config, mock_identity, empty_buffer):
    # Simulate not being registered
    transport = Transport(mock_config, mock_identity, empty_buffer)
    transport.registered = False
    
    # Attempt to send event
    transport.send_event({"type": "test"})
    
    # Verify buffered
    assert not empty_buffer.is_empty()
    assert empty_buffer.get_all()[0] == {"type": "test"}

@responses.activate
def test_recovery_after_collector_returns(mock_config, mock_identity, empty_buffer):
    transport = Transport(mock_config, mock_identity, empty_buffer)
    transport.registered = True
    
    # Fill buffer
    empty_buffer.add({"type": "buffered_event"})
    
    responses.add(
        responses.POST,
        "http://127.0.0.1:5000/api/v1/agent/events",
        status=200
    )
    
    transport.flush_buffer()
    
    assert empty_buffer.is_empty()

@responses.activate
def test_heartbeat_generation(mock_config, mock_identity, empty_buffer):
    responses.add(
        responses.POST,
        "http://127.0.0.1:5000/api/v1/agent/heartbeat",
        status=200
    )
    
    transport = Transport(mock_config, mock_identity, empty_buffer)
    transport.registered = True
    
    result = transport.send_heartbeat()
    assert result is True

@responses.activate
def test_authentication_failure(mock_config, mock_identity, empty_buffer):
    # If heartbeat returns 401, agent should mark itself as unregistered
    responses.add(
        responses.POST,
        "http://127.0.0.1:5000/api/v1/agent/heartbeat",
        status=401
    )
    
    transport = Transport(mock_config, mock_identity, empty_buffer)
    transport.registered = True
    
    transport.send_heartbeat()
    assert transport.registered is False

def test_windows_foundation(mock_config, mock_identity, empty_buffer):
    from windows.foundation import WindowsAgentFoundation
    transport = Transport(mock_config, mock_identity, empty_buffer)
    
    # Simply ensure it can be instantiated and send_test_event buffers if unregistered
    agent = WindowsAgentFoundation(transport)
    agent.send_test_event()
    assert not empty_buffer.is_empty()

def test_linux_foundation(mock_config, mock_identity, empty_buffer):
    from linux.foundation import LinuxAgentFoundation
    transport = Transport(mock_config, mock_identity, empty_buffer)
    
    agent = LinuxAgentFoundation(transport)
    agent.send_test_event()
    assert not empty_buffer.is_empty()
