import pytest
import pytest_asyncio
import uuid
import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from backend.app.models.host import Host
from backend.app.models.agent import Agent
from backend.app.models.raw_log import RawLog
from backend.app.models.event import Event
from backend.app.models.heartbeat import Heartbeat
from backend.app.db.base_class import Base
from backend.app.core.config import settings

from sqlalchemy.pool import NullPool

import os
from dotenv import load_dotenv

load_dotenv(".env.test")

# Test DB settings
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", 
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
)
if "soc_monitor_test" not in TEST_DATABASE_URL:
    TEST_DATABASE_URL = TEST_DATABASE_URL.replace("soc_monitor", "soc_monitor_test")

engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, echo=False)
TestingSessionLocal = async_sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=AsyncSession, expire_on_commit=False)

@pytest_asyncio.fixture(scope="function")
async def db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    async with TestingSessionLocal() as session:
        yield session

@pytest.mark.asyncio
async def test_db_connection(db: AsyncSession):
    result = await db.execute(text("SELECT 1"))
    assert result.scalar() == 1

@pytest.mark.asyncio
async def test_create_and_retrieve_host(db: AsyncSession):
    host_ident = str(uuid.uuid4())
    new_host = Host(host_identifier=host_ident, hostname="test-host", operating_system="Windows")
    db.add(new_host)
    await db.commit()
    await db.refresh(new_host)
    
    assert new_host.id is not None
    assert new_host.hostname == "test-host"
    assert new_host.status == "ONLINE"
    
    new_host.status = "OFFLINE"
    await db.commit()
    await db.refresh(new_host)
    assert new_host.status == "OFFLINE"

@pytest.mark.asyncio
async def test_create_and_retrieve_agent(db: AsyncSession):
    host = Host(host_identifier=str(uuid.uuid4()), hostname="agent-host")
    db.add(host)
    await db.commit()
    await db.refresh(host)
    
    agent_id = str(uuid.uuid4())
    agent = Agent(agent_id=agent_id, host_id=host.id, hostname="agent-host", agent_version="1.0.0")
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    
    assert agent.id is not None
    assert agent.status == "OFFLINE"
    assert agent.agent_version == "1.0.0"

@pytest.mark.asyncio
async def test_create_and_retrieve_raw_log(db: AsyncSession):
    event_ident = str(uuid.uuid4())
    timestamp = datetime.datetime.now(datetime.timezone.utc)
    raw_payload = '{"test": "payload", "value": 123}'
    
    raw_log = RawLog(
        event_identifier=event_ident,
        source_type="windows_event",
        timestamp=timestamp,
        raw_payload=raw_payload
    )
    db.add(raw_log)
    await db.commit()
    await db.refresh(raw_log)
    
    assert raw_log.id is not None
    assert raw_log.raw_payload == raw_payload
    assert raw_log.ingestion_status == "PENDING"

@pytest.mark.asyncio
async def test_create_and_retrieve_event(db: AsyncSession):
    host = Host(host_identifier=str(uuid.uuid4()), hostname="event-host")
    db.add(host)
    await db.commit()
    await db.refresh(host)
    
    event_id = str(uuid.uuid4())
    timestamp = datetime.datetime.now(datetime.timezone.utc)
    
    event = Event(
        event_id=event_id,
        timestamp=timestamp,
        host_id=host.id,
        event_category="authentication",
        event_type="login_success",
        severity="INFO"
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    
    assert event.id is not None
    assert event.host_id == host.id
    assert event.event_category == "authentication"

@pytest.mark.asyncio
async def test_create_and_retrieve_heartbeat(db: AsyncSession):
    host = Host(host_identifier=str(uuid.uuid4()), hostname="heartbeat-host")
    db.add(host)
    await db.commit()
    await db.refresh(host)
    
    agent = Agent(agent_id=str(uuid.uuid4()), host_id=host.id, hostname="heartbeat-host")
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    
    heartbeat = Heartbeat(
        agent_id=agent.id,
        host_id=host.id,
        status="ONLINE",
        ip_address="127.0.0.1"
    )
    db.add(heartbeat)
    await db.commit()
    await db.refresh(heartbeat)
    
    assert heartbeat.id is not None
    assert heartbeat.status == "ONLINE"
    assert heartbeat.ip_address == "127.0.0.1"
