import pytest_asyncio
import pytest
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.event import Event
from backend.app.models.host import Host
from backend.app.engine.correlation import correlation_engine
from backend.app.db.base_class import Base
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
import os

url = os.getenv("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:Vishal%402006@localhost:5432/soc_monitor_test")
engine = create_async_engine(url, poolclass=NullPool)
TestingSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

@pytest_asyncio.fixture
async def db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()

@pytest.mark.asyncio
async def test_rule_009_large_outbound_burst(db: AsyncSession):
    # Set threshold to 3 for testing
    correlation_engine.burst_threshold = 3
    source_ip = "10.0.0.99"
    
    # Create 2 network connections
    for i in range(2):
        ev = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_category="network",
            action="network_connection",
            source_ip=source_ip
        )
        db.add(ev)
    await db.commit()
    
    # 3rd event triggers
    ev3 = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_category="network",
        action="network_connection",
        source_ip=source_ip
    )
    db.add(ev3)
    await db.commit()
    
    syn = await correlation_engine.correlate(db, ev3)
    assert len(syn) == 1
    assert syn[0].event_type == "outbound_burst"
    
@pytest.mark.asyncio
async def test_rule_010_repeated_closed_ports(db: AsyncSession):
    correlation_engine.closed_port_threshold = 3
    source_ip = "10.0.0.100"
    
    # Drops to 2 distinct ports
    for port in [80, 443]:
        ev = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_category="firewall",
            action="deny",
            source_ip=source_ip,
            destination_port=port
        )
        db.add(ev)
    await db.commit()
    
    # 3rd port
    ev3 = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_category="firewall",
        action="deny",
        source_ip=source_ip,
        destination_port=22
    )
    db.add(ev3)
    await db.commit()
    
    syn = await correlation_engine.correlate(db, ev3)
    assert len(syn) == 1
    assert syn[0].event_type == "closed_port"

@pytest.mark.asyncio
async def test_rule_011_and_013_login_failures(db: AsyncSession):
    correlation_engine.login_failure_threshold = 3
    source_ip = "10.0.0.101"
    username = "admin"
    
    # 2 failures
    for i in range(2):
        ev = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_category="authentication",
            action="login_failed",
            source_ip=source_ip,
            username=username
        )
        db.add(ev)
    await db.commit()
    
    # 3rd failure triggers RULE-013 (brute force)
    ev3 = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_category="authentication",
        action="login_failed",
        source_ip=source_ip,
        username=username
    )
    db.add(ev3)
    await db.commit()
    
    syn = await correlation_engine.correlate(db, ev3)
    assert len(syn) == 1
    assert syn[0].event_type == "brute_force_pattern"
    
    # Followed by success triggers RULE-011 (success after failures)
    ev_success = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_category="authentication",
        action="login_success",
        source_ip=source_ip,
        username=username
    )
    db.add(ev_success)
    await db.commit()
    
    syn2 = await correlation_engine.correlate(db, ev_success)
    assert any(s.event_type == "login_success_after_failures" for s in syn2)

@pytest.mark.asyncio
async def test_rule_014_lateral_movement(db: AsyncSession):
    correlation_engine.lateral_movement_window_minutes = 30
    source_ip = "10.0.0.102"
    hostname = "target-host"
    
    # Successful login
    ev_login = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc) - timedelta(minutes=5),
        event_category="authentication",
        action="login_success",
        source_ip=source_ip,
        hostname=hostname
    )
    db.add(ev_login)
    await db.commit()
    
    # Process creation
    ev_proc = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_category="process",
        action="process_creation",
        hostname=hostname
    )
    db.add(ev_proc)
    await db.commit()
    
    syn = await correlation_engine.correlate(db, ev_proc)
    assert len(syn) == 1
    assert syn[0].event_type == "lateral_movement"

@pytest.mark.asyncio
async def test_rule_012_unusual_source(db: AsyncSession):
    correlation_engine.baseline_days = 7
    correlation_engine.baseline_min_observations = 2
    
    hostname = "baseline-host"
    known_ip = "192.168.1.100"
    unusual_ip = "192.168.1.200"
    
    # Seed baseline (min 2 days)
    for days_ago in [5, 2]:
        ev = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc) - timedelta(days=days_ago),
            event_category="authentication",
            action="login_success",
            source_ip=known_ip,
            hostname=hostname
        )
        db.add(ev)
    await db.commit()
    
    # Known IP login - no alert
    ev_known = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_category="authentication",
        action="login_success",
        source_ip=known_ip,
        hostname=hostname
    )
    db.add(ev_known)
    await db.commit()
    syn1 = await correlation_engine.correlate(db, ev_known)
    assert not any(s.event_type == "unusual_source" for s in syn1)
    
    # Unusual IP login - ALERTS
    ev_unusual = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_category="authentication",
        action="login_success",
        source_ip=unusual_ip,
        hostname=hostname
    )
    db.add(ev_unusual)
    await db.commit()
    syn2 = await correlation_engine.correlate(db, ev_unusual)
    assert any(s.event_type == "unusual_source" for s in syn2)
