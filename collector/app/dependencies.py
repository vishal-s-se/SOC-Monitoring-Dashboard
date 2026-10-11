import sys
import os
import hmac
import hashlib

# Add the project root to sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.future import select

from .config import settings
from backend.app.models.agent import Agent
from backend.app.models.enrollment import EnrollmentCode

# Setup Database using Phase 2 connection
url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://") if settings.DATABASE_URL else ""
engine = create_async_engine(url, poolclass=NullPool, echo=False)
SessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db():
    async with SessionLocal() as session:
        yield session

api_key_header = APIKeyHeader(name="X-Agent-Auth", auto_error=False)

def get_hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()

async def verify_agent_auth(
    api_key: str = Security(api_key_header),
    db: AsyncSession = Depends(get_db)
):
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication",
        )
        
    # 1. Check legacy shared secret
    if settings.AGENT_SHARED_SECRET and hmac.compare_digest(api_key, settings.AGENT_SHARED_SECRET):
        return {"type": "legacy", "value": api_key}
        
    api_key_hash = get_hash(api_key)
    
    # 2. Check if it's a valid agent token
    stmt = select(Agent).where(Agent.token_hash == api_key_hash)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    
    if agent:
        return {"type": "token", "value": api_key, "agent": agent}
        
    # 3. Check if it's an unused enrollment code
    stmt = select(EnrollmentCode).where(EnrollmentCode.code_hash == api_key_hash, EnrollmentCode.used == False)
    result = await db.execute(stmt)
    code = result.scalar_one_or_none()
    
    import datetime
    if code and code.expires_at > datetime.datetime.now(datetime.timezone.utc):
        return {"type": "enrollment", "value": api_key, "code": code}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
    )
