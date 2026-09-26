import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class ConditionEvaluator:
    """Safe condition evaluator for normalized event fields."""

    @staticmethod
    def evaluate(event_data: Dict[str, Any], conditions: List[Dict[str, Any]]) -> bool:
        """
        Evaluate a list of conditions against normalized event data.
        If all conditions pass, return True.
        
        Example condition:
        {"field": "event_type", "operator": "equals", "value": "ssh_login"}
        """
        if not conditions:
            return False

        for condition in conditions:
            field = condition.get("field")
            operator = condition.get("operator", "equals").lower()
            expected_value = condition.get("value")
            
            if not field or expected_value is None:
                logger.warning(f"Invalid condition missing field or value: {condition}")
                return False

            # Retrieve actual value from the event
            actual_value = event_data.get(field)
            
            if not ConditionEvaluator._evaluate_single(actual_value, operator, expected_value):
                return False
                
        return True

    @staticmethod
    def _evaluate_single(actual_value: Any, operator: str, expected_value: Any) -> bool:
        if actual_value is None:
            return False

        # Convert to strings for basic operations to ensure type safety
        str_actual = str(actual_value).lower()
        str_expected = str(expected_value).lower()

        if operator == "equals":
            return str_actual == str_expected
        elif operator == "not equals":
            return str_actual != str_expected
        elif operator == "contains":
            return str_expected in str_actual
        elif operator == "starts with":
            return str_actual.startswith(str_expected)
        elif operator == "ends with":
            return str_actual.endswith(str_expected)
        else:
            logger.warning(f"Unsupported operator: {operator}")
            return False
