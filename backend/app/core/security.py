import hashlib
import hmac
import logging
import uuid
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from backend.app.core.config import settings

logger = logging.getLogger("soc_monitor.security")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"
_MAX_REVOKED = 10_000
_revoked_jtis: OrderedDict[str, float] = OrderedDict()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        logger.warning("Password verification failed due to hash error")
        return False


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    jti = str(uuid.uuid4())
    to_encode: dict[str, Any] = {"exp": expire, "sub": str(subject), "jti": jti}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    jti = payload.get("jti")
    if jti and jti in _revoked_jtis:
        raise JWTError("Token has been revoked")
    return payload


def revoke_token(jti: Optional[str]) -> None:
    if not jti:
        return
    _revoked_jtis[jti] = datetime.now(timezone.utc).timestamp()
    while len(_revoked_jtis) > _MAX_REVOKED:
        _revoked_jtis.popitem(last=False)


def constant_time_equals(left: str, right: str) -> bool:
    left_digest = hashlib.sha256((left or "").encode("utf-8")).digest()
    right_digest = hashlib.sha256((right or "").encode("utf-8")).digest()
    return hmac.compare_digest(left_digest, right_digest)


def redact_secrets(value: str) -> str:
    redacted = value
    for secret in filter(None, [settings.SECRET_KEY, settings.DATABASE_URL]):
        if secret and secret in redacted:
            redacted = redacted.replace(secret, "[REDACTED]")
    return redacted
