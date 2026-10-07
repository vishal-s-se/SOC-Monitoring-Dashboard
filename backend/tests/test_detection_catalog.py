from backend.app.engine.evaluator import ConditionEvaluator
from backend.app.services.detection_catalog import DETECTION_CATALOG
from backend.app.services.detection_seeder import seed_detection_catalog


class _ScalarResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return list(self.values)


class _FakeSession:
    def __init__(self):
        self.rules = {}

    async def execute(self, statement):
        return _ScalarResult(self.rules.values())

    def add(self, rule):
        self.rules[rule.rule_id] = rule

    async def commit(self):
        return None


def test_detection_catalog_contains_required_rules_once():
    rule_ids = [entry["rule_id"] for entry in DETECTION_CATALOG]
    assert rule_ids == [f"RULE-{number:03d}" for number in range(4, 16)]
    assert len(rule_ids) == len(set(rule_ids))
    assert all(entry["conditions"] for entry in DETECTION_CATALOG)


def test_catalog_enabled_rules_use_supported_single_event_conditions():
    event = {
        "event_category": "process",
        "event_type": "powershell",
        "username": "analyst",
        "action": "exec",
        "source_ip": "192.0.2.10",
    }
    enabled_rules = [entry for entry in DETECTION_CATALOG if entry["enabled"]]
    assert {entry["rule_id"] for entry in enabled_rules} == {
        "RULE-004",
        "RULE-005",
        "RULE-006",
        "RULE-007",
        "RULE-008",
        "RULE-015",
    }
    assert ConditionEvaluator.evaluate(event, next(entry["conditions"] for entry in enabled_rules if entry["rule_id"] == "RULE-007"))
    assert ConditionEvaluator.evaluate(event, next(entry["conditions"] for entry in enabled_rules if entry["rule_id"] == "RULE-015"))


def test_correlation_rules_are_present_but_disabled():
    disabled = {entry["rule_id"]: entry for entry in DETECTION_CATALOG if not entry["enabled"]}
    assert set(disabled) == {"RULE-009", "RULE-010", "RULE-011", "RULE-012", "RULE-013", "RULE-014"}
    assert all("correlation-required" in entry["tags"] or "baseline-required" in entry["tags"] for entry in disabled.values())


def test_detection_catalog_seed_is_idempotent_and_preserves_disabled_state():
    session = _FakeSession()
    first = __import__("asyncio").run(seed_detection_catalog(session))
    session.rules["RULE-009"].enabled = False
    second = __import__("asyncio").run(seed_detection_catalog(session))
    assert first == {"created": 12, "updated": 0, "total": 12}
    assert second == {"created": 0, "updated": 0, "total": 12}
    assert session.rules["RULE-009"].enabled is False
