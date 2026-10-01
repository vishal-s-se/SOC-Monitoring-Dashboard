from typing import List, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError as InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.audit import audit
from backend.app.core.security import decode_access_token
from backend.app.db.session import get_db
from backend.app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)

ROLE_LEVEL = {"VIEWER": 1, "ANALYST": 2, "ADMIN": 3}
ADMIN_WRITE_PREFIXES = ("/api/v1/retention",)
ADMIN_WRITE_PATHS = ("/api/v1/mitre/seed",)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    raw = token
    if not raw:
        header = request.headers.get("authorization") or ""
        if header.lower().startswith("bearer "):
            raw = header.split(" ", 1)[1].strip()
    if not raw:
        audit("authentication_failure", outcome="denied", reason="missing_token")
        raise credentials_exception
    try:
        payload = decode_access_token(raw)
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        request.state.token_jti = payload.get("jti")
    except InvalidTokenError:
        audit("authentication_failure", outcome="denied", reason="invalid_token")
        raise credentials_exception

    try:
        user_pk = int(user_id)
    except (TypeError, ValueError):
        raise credentials_exception

    user = (await db.execute(select(User).where(User.id == user_pk))).scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if (current_user.status or "").upper() != "ACTIVE":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return current_user


def role_at_least(user: User, minimum: str) -> bool:
    return ROLE_LEVEL.get((user.role or "").upper(), 0) >= ROLE_LEVEL[minimum]


async def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if not role_at_least(current_user, "ADMIN"):
        audit("authorization_failure", actor=current_user.username, outcome="denied", reason="admin_required")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return current_user


async def require_analyst(current_user: User = Depends(get_current_active_user)) -> User:
    if not role_at_least(current_user, "ANALYST"):
        audit("authorization_failure", actor=current_user.username, outcome="denied", reason="analyst_required")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Analyst access required")
    return current_user


async def enforce_method_roles(
    request: Request,
    current_user: User = Depends(get_current_active_user),
) -> User:
    method = request.method.upper()
    path = request.url.path.rstrip("/") or "/"
    if method in ("GET", "HEAD", "OPTIONS"):
        if path.startswith("/api/v1/reports"):
            if not role_at_least(current_user, "ANALYST"):
                audit(
                    "authorization_failure",
                    actor=current_user.username,
                    outcome="denied",
                    reason="export_forbidden",
                    path=path,
                )
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Export access required")
        return current_user

    if path.startswith(ADMIN_WRITE_PREFIXES) or path in ADMIN_WRITE_PATHS:
        if not role_at_least(current_user, "ADMIN"):
            audit(
                "authorization_failure",
                actor=current_user.username,
                outcome="denied",
                reason="admin_write_forbidden",
                path=path,
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
        return current_user

    if not role_at_least(current_user, "ANALYST"):
        audit(
            "authorization_failure",
            actor=current_user.username,
            outcome="denied",
            reason="write_forbidden",
            path=path,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Analyst access required")
    return current_user
