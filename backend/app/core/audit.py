import logging
import re
from typing import Any, Optional

logger = logging.getLogger("soc_monitor.audit")

_SECRET_KEYS = re.compile(
    r"(password|passwd|secret|token|authorization|api[_-]?key|private[_-]?key|jwt|credential)",
    re.IGNORECASE,
)


def _sanitize(data: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not data:
        return {}
    clean: dict[str, Any] = {}
    for key, value in data.items():
        if _SECRET_KEYS.search(str(key)):
            clean[key] = "[REDACTED]"
        else:
            clean[key] = value
    return clean


def audit(event: str, *, actor: str = "anonymous", outcome: str = "success", **details: Any) -> None:
    payload = _sanitize(details)
    logger.info(
        "AUDIT event=%s actor=%s outcome=%s details=%s",
        event,
        actor,
        outcome,
        payload,
    )
