import pytest
import os
import tempfile
import uuid
from unittest.mock import MagicMock, patch
from shared.state import StateManager
from shared.envelope import create_envelope
from linux.collector import LinuxLogCollector

@pytest.fixture
def temp_state_dir():
    with tempfile.TemporaryDirectory() as tmpdirname:
        yield tmpdirname

def test_state_manager(temp_state_dir):
    manager = StateManager(temp_state_dir)
    
    # Test default
    assert manager.get_state("test_source") is None
    assert manager.get_state("test_source", default={"pos": 0}) == {"pos": 0}
    
    # Test save and load
    manager.set_state("test_source", {"pos": 42, "inode": 12345})
    assert manager.get_state("test_source") == {"pos": 42, "inode": 12345}
    
    # Test atomic overwrite
    manager.set_state("test_source", {"pos": 100})
    assert manager.get_state("test_source") == {"pos": 100}

def test_envelope_creation():
    identity = MagicMock()
    identity.agent_id = "test-agent-123"
    identity.hostname = "test-host"
    identity.os_type = "Linux"
    identity.os_version = "Ubuntu"
    
    envelope = create_envelope(
        identity=identity,
        event_type="test_event",
        source="test_source",
        payload={"key": "value"}
    )
    
    assert envelope["agent_id"] == "test-agent-123"
    assert envelope["hostname"] == "test-host"
    assert envelope["operating_system"] == "Linux Ubuntu"
    assert envelope["event_type"] == "test_event"
    assert envelope["source"] == "test_source"
    assert envelope["payload"] == '{"key": "value"}'
    assert "event_id" in envelope
    assert "timestamp" in envelope

@pytest.fixture
def mock_transport():
    transport = MagicMock()
    transport.send_event = MagicMock(return_value=True)
    return transport

@pytest.fixture
def mock_identity():
    identity = MagicMock()
    identity.agent_id = "test-agent-123"
    identity.hostname = "test-host"
    identity.os_type = "Linux"
    identity.os_version = "Ubuntu"
    return identity

def test_linux_collector_incremental(temp_state_dir, mock_transport, mock_identity):
    manager = StateManager(temp_state_dir)
    
    with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
        log_path = f.name
        f.write("line 1\n")
        f.write("line 2\n")
        
    try:
        collector = LinuxLogCollector(
            log_paths=[log_path],
            state_manager=manager,
            transport=mock_transport,
            identity=mock_identity
        )
        
        events = collector.collect()
        assert events == 2
        assert mock_transport.send_event.call_count == 2
        
        mock_transport.send_event.reset_mock()
        events = collector.collect()
        assert events == 0
        assert mock_transport.send_event.call_count == 0
        
        with open(log_path, 'a') as f:
            f.write("line 3\n")
            
        events = collector.collect()
        assert events == 1
        assert mock_transport.send_event.call_count == 1
        
    finally:
        os.unlink(log_path)

def test_linux_collector_rotation(temp_state_dir, mock_transport, mock_identity):
    manager = StateManager(temp_state_dir)
    
    with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
        log_path = f.name
        f.write("line 1\n")
        
    try:
        collector = LinuxLogCollector(
            log_paths=[log_path],
            state_manager=manager,
            transport=mock_transport,
            identity=mock_identity
        )
        
        events = collector.collect()
        assert events == 1
        
        os.unlink(log_path)
        with open(log_path, 'w') as f:
            f.write("new line 1\n")
            f.write("new line 2\n")
            
        events = collector.collect()
        assert events == 2
        
    finally:
        if os.path.exists(log_path):
            os.unlink(log_path)

def test_linux_journald_cursor_recovery(temp_state_dir, mock_transport, mock_identity):
    from linux.collector import LinuxLogCollector

    collector = LinuxLogCollector(
        log_paths=[],
        state_manager=StateManager(temp_state_dir),
        transport=mock_transport,
        identity=mock_identity,
        journald_enabled=True,
    )
    journal_output = (
        '{"__CURSOR":"s=one","MESSAGE":"accepted","_SOURCE_REALTIME_TIMESTAMP":"1700000000000000"}\n'
        '-- cursor: s=one\n'
    )
    completed = MagicMock(returncode=0, stdout=journal_output)
    empty_batch = MagicMock(returncode=0, stdout="-- cursor: s=one\n")
    with patch("linux.collector.subprocess.run", side_effect=[completed, empty_batch]) as run:
        assert collector.collect_journald() == 1
        assert collector.collect_journald() == 0
        assert run.call_args_list[1].args[0][-2:] == ["--after-cursor", "s=one"]

    assert mock_transport.send_event.call_count == 1
    assert mock_transport.send_event.call_args.args[0]["event_id"] == "s=one"
            
def test_windows_collector_unit(temp_state_dir, mock_transport, mock_identity):
    manager = StateManager(temp_state_dir)
    
    from windows.collector import WindowsEventLogCollector
    
    mock_evtlog = MagicMock()
    mock_query_handle = MagicMock()
    mock_evtlog.EvtQuery.return_value = mock_query_handle
    
    mock_event_1 = MagicMock()
    mock_evtlog.EvtNext.side_effect = [[mock_event_1], []]
    mock_evtlog.EvtRender.side_effect = [
        '<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><EventID>4624</EventID><EventRecordID>123</EventRecordID></System></Event>',
        '<Bookmark/>'
    ]
    
    with patch.dict("sys.modules", {"win32evtlog": mock_evtlog, "win32event": MagicMock(), "win32con": MagicMock()}), \
         patch("windows.collector.HAS_WIN32", True), \
         patch("windows.collector.win32evtlog", mock_evtlog, create=True):
         
        collector = WindowsEventLogCollector(
            channels=["Security"],
            state_manager=manager,
            transport=mock_transport,
            identity=mock_identity
        )
        
        events = collector.collect()
        assert events == 1
        assert mock_transport.send_event.call_count == 1
        
        state = manager.get_state("win_evt_Security")
        assert state is not None
        assert state["bookmark"] == '<Bookmark/>'
