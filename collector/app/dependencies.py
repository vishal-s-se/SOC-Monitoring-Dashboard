import sys
import os

# Add the project root to sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from collector.app.config import settings

# Setup Database using Phase 2 connection
# Using NullPool for simplicity in collector to avoid event loop issues across tests
url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://") if settings.DATABASE_URL else ""
engine = create_async_engine(url, poolclass=NullPool, echo=False)
SessionLocal = async_sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=AsyncSession)

async def get_db():
    async with SessionLocal() as session:
        yield session

# Basic Authentication via Shared Secret Header
api_key_header = APIKeyHeader(name="X-Agent-Auth", auto_error=False)

async def verify_agent_auth(api_key: str = Security(api_key_header)):
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication",
        )
    if api_key != settings.AGENT_SHARED_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return api_key
