import logging
from typing import List, Optional
from datetime import datetime, timezone

from backend.app.models.event import Event
from backend.app.models.detection import DetectionRule, DetectionResult
from backend.app.engine.evaluator import ConditionEvaluator

logger = logging.getLogger(__name__)

class DetectionEngine:
    def __init__(self, rules: List[DetectionRule]):
        self.rules = [r for r in rules if r.enabled]
        self.evaluator = ConditionEvaluator()

    def evaluate_event(self, event: Event) -> List[DetectionResult]:
        """
        Evaluates a single normalized event against all active rules.
        Returns a list of DetectionResults for matched rules.
        """
        results = []
        event_data = self._event_to_dict(event)

        for rule in self.rules:
            try:
                # If conditions are met, create a DetectionResult
                if self.evaluator.evaluate(event_data, rule.conditions):
                    result = DetectionResult(
                        event_id=event.id,
                        rule_id=rule.id,
                        status="NEW",
                        timestamp=datetime.now(timezone.utc),
                        metadata_={
                            "rule_name": rule.name,
                            "severity": rule.severity,
                            "matched_fields": [c.get("field") for c in rule.conditions]
                        }
                    )
                    results.append(result)
            except Exception as e:
                logger.error(f"Error evaluating rule {rule.rule_id} against event {event.event_id}: {e}")

        return results

    def evaluate_batch(self, events: List[Event]) -> List[DetectionResult]:
        """
        Evaluates a batch of normalized events.
        """
        all_results = []
        for event in events:
            all_results.extend(self.evaluate_event(event))
        return all_results

    def _event_to_dict(self, event: Event) -> dict:
        """Helper to convert Event ORM model to dictionary for evaluation."""
        return {
            "event_id": event.event_id,
            "host_id": event.host_id,
            "agent_id": event.agent_id,
            "hostname": event.hostname,
            "operating_system": event.operating_system,
            "source_type": event.source_type,
            "event_category": event.event_category,
            "event_type": event.event_type,
            "username": event.username,
            "source_ip": event.source_ip,
            "destination_ip": event.destination_ip,
            "source_port": event.source_port,
            "destination_port": event.destination_port,
            "protocol": event.protocol,
            "action": event.action,
            "severity": event.severity
        }
