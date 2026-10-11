
import pytest
from collector.app.parser import parse_windows_event

def test_parse_windows_event_nested():
    payload = {
        "System": {"EventID": 4624, "Level": 4, "Security": {"UserID": "admin"}},
        "EventData": {"IpAddress": "10.0.0.1"}
    }
    res = parse_windows_event(payload)
    assert res.get("event_type") == "4624"
    assert res.get("username") == "admin"
    assert res.get("severity") == "INFO"

def test_parse_windows_event_flat():
    payload = {
        "Provider": "Application",
        "EventID": "7045",
        "Level": "1",
        "EventData": {"TargetUserName": "system_user"}
    }
    res = parse_windows_event(payload)
    assert res.get("event_type") == "service_created"
    assert res.get("username") == "system_user"
    assert res.get("severity") == "HIGH"
    
def test_parse_windows_event_malformed_id():
    payload = {
        "EventID": "not-an-int"
    }
    res = parse_windows_event(payload)
    assert res.get("event_type") is None

