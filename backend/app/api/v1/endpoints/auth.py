from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_current_active_user
from backend.app.core.audit import audit
from backend.app.core.rate_limit import (
    check_rate_limit,
    clear_login_failures,
    client_ip,
    login_is_locked,
    record_login_failure,
)
from backend.app.core.security import create_access_token, revoke_token, verify_password
from backend.app.db.session import get_db
from backend.app.models.user import User

router = APIRouter()


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=128)
    password: str = Field(..., min_length=1, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: int
    username: str
    role: str
    status: str

    class Config:
        from_attributes = True


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = client_ip(request)
    identity = f"{ip}:{payload.username.lower()}"
    check_rate_limit(f"login:{ip}", limit=5, window_seconds=60)

    if login_is_locked(identity):
        audit("authentication_failure", actor=payload.username, outcome="denied", reason="locked")
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many failed login attempts")

    user = (await db.execute(select(User).where(User.username == payload.username))).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        failures = record_login_failure(identity)
        audit("authentication_failure", actor=payload.username, outcome="denied", reason="invalid_credentials", failures=failures)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    if (user.status or "").upper() != "ACTIVE":
        audit("authentication_failure", actor=payload.username, outcome="denied", reason="inactive")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    clear_login_failures(identity)
    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    token = create_access_token(str(user.id))
    audit("authentication_success", actor=user.username, outcome="success")
    return TokenResponse(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, current_user: User = Depends(get_current_active_user)):
    revoke_token(getattr(request.state, "token_jti", None))
    audit("session_invalidation", actor=current_user.username, outcome="success")
    return None


@router.get("/me", response_model=UserMe)
async def read_me(current_user: User = Depends(get_current_active_user)):
    return current_user
