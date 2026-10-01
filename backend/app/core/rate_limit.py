import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import HTTPException, Request, status

from backend.app.core.config import settings

_buckets: Dict[str, Deque[float]] = defaultdict(deque)
_login_failures: Dict[str, Tuple[int, float]] = {}


def _prune(bucket: Deque[float], window_seconds: float, now: float) -> None:
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()


def check_rate_limit(key: str, limit: int, window_seconds: int = 60) -> None:
    if not settings.RATE_LIMIT_ENABLED:
        return
    now = time.monotonic()
    bucket = _buckets[key]
    _prune(bucket, window_seconds, now)
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )
    bucket.append(now)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and not settings.is_production:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def record_login_failure(identity: str) -> int:
    now = time.monotonic()
    count, first = _login_failures.get(identity, (0, now))
    if now - first > 900:
        count, first = 0, now
    count += 1
    _login_failures[identity] = (count, first)
    return count


def clear_login_failures(identity: str) -> None:
    _login_failures.pop(identity, None)


def login_is_locked(identity: str, max_failures: int = 5, lock_seconds: int = 900) -> bool:
    count, first = _login_failures.get(identity, (0, 0.0))
    if count < max_failures:
        return False
    return time.monotonic() - first < lock_seconds


def rate_limit_for_path(path: str) -> int:
    expensive = (
        "/reports",
        "/analytics",
        "/retention",
        "/attack-timeline",
        "/ip-investigation",
        "/host-investigation",
        "/investigations",
        "/user-context",
    )
    if path.startswith(settings.API_V1_STR + "/auth/login"):
        return settings.LOGIN_RATE_LIMIT_PER_MINUTE
    if any(path.startswith(settings.API_V1_STR + prefix) for prefix in expensive):
        return settings.EXPENSIVE_RATE_LIMIT_PER_MINUTE
    return settings.API_RATE_LIMIT_PER_MINUTE
