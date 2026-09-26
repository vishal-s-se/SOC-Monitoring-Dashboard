import pytest
from datetime import datetime, timezone
import uuid

from backend.app.models.event import Event
from backend.app.models.detection import DetectionRule
from backend.app.engine.evaluator import ConditionEvaluator
from backend.app.engine.core import DetectionEngine

def test_condition_evaluator_basic():
    event_data = {
        "event_category": "windows",
        "action": "process_creation",
        "username": "admin"
    }

    # Equals
    assert ConditionEvaluator.evaluate(event_data, [{"field": "action", "operator": "equals", "value": "process_creation"}]) is True
    assert ConditionEvaluator.evaluate(event_data, [{"field": "action", "operator": "equals", "value": "network_connection"}]) is False
    
    # Not Equals
    assert ConditionEvaluator.evaluate(event_data, [{"field": "username", "operator": "not equals", "value": "guest"}]) is True
    
    # Contains
    assert ConditionEvaluator.evaluate(event_data, [{"field": "action", "operator": "contains", "value": "process"}]) is True
    
    # Starts with / Ends with
    assert ConditionEvaluator.evaluate(event_data, [{"field": "username", "operator": "starts with", "value": "adm"}]) is True
    assert ConditionEvaluator.evaluate(event_data, [{"field": "username", "operator": "ends with", "value": "min"}]) is True
    
    # Multiple conditions (AND logic)
    assert ConditionEvaluator.evaluate(event_data, [
        {"field": "action", "operator": "equals", "value": "process_creation"},
        {"field": "username", "operator": "equals", "value": "admin"}
    ]) is True

def test_condition_evaluator_missing_fields():
    event_data = {"username": "admin"}
    
    # Target field missing in event
    assert ConditionEvaluator.evaluate(event_data, [{"field": "action", "operator": "equals", "value": "login"}]) is False
    
    # Malformed condition
    assert ConditionEvaluator.evaluate(event_data, [{"operator": "equals", "value": "admin"}]) is False

def test_detection_engine_single_event():
    rule = DetectionRule(
        id=1,
        rule_id="RUL-001",
        name="SSH Root Login",
        enabled=True,
        severity="HIGH",
        conditions=[
            {"field": "event_type", "operator": "equals", "value": "ssh_login"},
            {"field": "username", "operator": "equals", "value": "root"}
        ]
    )
    
    engine = DetectionEngine(rules=[rule])
    
    event = Event(
        id=100,
        event_id=str(uuid.uuid4()),
        event_category="linux",
        event_type="ssh_login",
        username="root",
        source_ip="10.0.0.1"
    )
    
    results = engine.evaluate_event(event)
    assert len(results) == 1
    assert results[0].rule_id == 1
    assert results[0].event_id == 100
    assert results[0].status == "NEW"

def test_detection_engine_mismatch():
    rule = DetectionRule(
        id=1,
        rule_id="RUL-001",
        name="SSH Root Login",
        enabled=True,
        severity="HIGH",
        conditions=[
            {"field": "event_type", "operator": "equals", "value": "ssh_login"},
            {"field": "username", "operator": "equals", "value": "root"}
        ]
    )
    
    engine = DetectionEngine(rules=[rule])
    
    event = Event(
        id=100,
        event_id=str(uuid.uuid4()),
        event_category="linux",
        event_type="ssh_login",
        username="user1",  # Not root
    )
    
    results = engine.evaluate_event(event)
    assert len(results) == 0

def test_detection_engine_batch():
    rule1 = DetectionRule(
        id=1, rule_id="RUL-01", name="R1", enabled=True, severity="HIGH",
        conditions=[{"field": "action", "operator": "equals", "value": "login_success"}]
    )
    rule2 = DetectionRule(
        id=2, rule_id="RUL-02", name="R2", enabled=True, severity="CRITICAL",
        conditions=[{"field": "severity", "operator": "equals", "value": "CRITICAL"}]
    )
    
    engine = DetectionEngine(rules=[rule1, rule2])
    
    events = [
        Event(id=10, event_id="e1", action="login_success", severity="INFO"),
        Event(id=11, event_id="e2", action="login_failed", severity="CRITICAL"),
        Event(id=12, event_id="e3", action="other", severity="LOW")
    ]
    
    results = engine.evaluate_batch(events)
    assert len(results) == 2
    
    rule_ids_matched = [r.rule_id for r in results]
    assert 1 in rule_ids_matched # event 10 matched rule 1
    assert 2 in rule_ids_matched # event 11 matched rule 2
