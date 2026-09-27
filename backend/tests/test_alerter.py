import pytest
import uuid
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.models.detection import DetectionRule, DetectionResult
from backend.app.models.alert import Alert
from backend.app.models.event import Event
from backend.app.models.agent import Agent
from backend.app.models.host import Host
from backend.app.engine.alerter import AlertService
from httpx import AsyncClient

import pytest_asyncio
import os
from dotenv import load_dotenv
load_dotenv(".env.test")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from backend.app.db.base_class import Base
from httpx import AsyncClient
from backend.app.main import app

url = os.getenv("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/soc_monitor_test")
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

@pytest_asyncio.fixture
async def client(db: AsyncSession):
    async def override_get_db():
        yield db

    from backend.app.db.session import get_db
    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def setup_data(db: AsyncSession):
    # Setup Host
    host = Host(host_identifier=str(uuid.uuid4()), hostname="test-host", operating_system="linux")
    db.add(host)
    await db.flush()

    # Setup Agent
    agent = Agent(agent_id=str(uuid.uuid4()), host_id=host.id, hostname="test-host", operating_system="linux", agent_version="1.0", status="ONLINE")
    db.add(agent)
    await db.flush()

    # Setup Rule
    rule = DetectionRule(rule_id="RUL-101", name="Test Rule", severity="CRITICAL", conditions=[])
    db.add(rule)
    await db.flush()

    # Setup Event
    event = Event(event_id=str(uuid.uuid4()), timestamp=datetime.now(timezone.utc), host_id=host.id, agent_id=agent.id, hostname="test-host", event_category="linux")
    db.add(event)
    await db.flush()

    # Setup DetectionResult
    result = DetectionResult(event_id=event.id, rule_id=rule.id, status="NEW")
    db.add(result)
    await db.commit()

    return {"host": host, "agent": agent, "rule": rule, "event": event, "result": result}

@pytest.mark.asyncio
async def test_alert_creation_and_defaults(db: AsyncSession, setup_data):
    rule = setup_data["rule"]
    event = setup_data["event"]
    result = setup_data["result"]

    # Generate Alert
    alert = await AlertService.process_detection(db, result, rule, event)
    await db.commit()

    # 1. Alert model creation, 2. Defaults to OPEN, 3. Severity propagation
    assert alert is not None
    assert alert.status == "OPEN"
    assert alert.severity == "CRITICAL"
    assert alert.occurrence_count == 1
    assert alert.first_seen is not None
    assert alert.last_seen is not None

    # 4. Detection-to-alert creation, 10. Detection reference preservation, 11. Event reference
    assert result.alert_id == alert.id
    assert result.status == "PROCESSED"
    assert alert.rule_id == rule.id
    assert alert.agent_id == event.agent_id
    assert alert.host_id == event.host_id

@pytest.mark.asyncio
async def test_alert_deduplication_and_occurrences(db: AsyncSession, setup_data):
    rule = setup_data["rule"]
    event = setup_data["event"]
    result1 = setup_data["result"]

    # First detection
    alert1 = await AlertService.process_detection(db, result1, rule, event)
    await db.commit()
    first_seen_orig = alert1.first_seen
    last_seen_orig = alert1.last_seen

    # Simulate time passing
    await asyncio.sleep(0.1)

    # Second detection (duplicate)
    result2 = DetectionResult(event_id=event.id, rule_id=rule.id, status="NEW")
    db.add(result2)
    await db.flush()

    alert2 = await AlertService.process_detection(db, result2, rule, event)
    await db.commit()

    # 5. Alert fingerprint generation, 6. Duplicate alert prevention, 7. Occurrence increment
    assert alert1.id == alert2.id
    assert alert2.occurrence_count == 2

    # 8. first_seen preservation, 9. last_seen update
    assert alert2.first_seen == first_seen_orig
    assert alert2.last_seen > last_seen_orig

    # 15. Repeated OPEN detection behavior
    assert alert2.status == "OPEN"

@pytest.mark.asyncio
async def test_alert_lifecycle_and_resolved_behavior(db: AsyncSession, setup_data):
    rule = setup_data["rule"]
    event = setup_data["event"]

    # Create Alert
    res1 = DetectionResult(event_id=event.id, rule_id=rule.id, status="NEW")
    db.add(res1)
    await db.flush()
    alert = await AlertService.process_detection(db, res1, rule, event)
    await db.commit()

    # 12. OPEN -> ACKNOWLEDGED
    ack_alert = await AlertService.acknowledge_alert(db, alert.alert_id)
    await db.commit()
    assert ack_alert.status == "ACKNOWLEDGED"

    # Duplicate during ACKNOWLEDGED (should update occurrence, remain ACKNOWLEDGED)
    res2 = DetectionResult(event_id=event.id, rule_id=rule.id, status="NEW")
    db.add(res2)
    await db.flush()
    alert_dup = await AlertService.process_detection(db, res2, rule, event)
    await db.commit()

    assert alert_dup.id == ack_alert.id
    assert alert_dup.occurrence_count == 2
    assert alert_dup.status == "ACKNOWLEDGED"

    # 13. ACKNOWLEDGED -> RESOLVED
    res_alert = await AlertService.resolve_alert(db, alert.alert_id)
    await db.commit()
    assert res_alert.status == "RESOLVED"

    # 16. New alert after appropriate resolved-alert scenario
    res3 = DetectionResult(event_id=event.id, rule_id=rule.id, status="NEW")
    db.add(res3)
    await db.flush()
    new_alert = await AlertService.process_detection(db, res3, rule, event)
    await db.commit()

    assert new_alert.id != res_alert.id
    assert new_alert.status == "OPEN"
    assert new_alert.occurrence_count == 1

@pytest.mark.asyncio
async def test_invalid_state_transitions(db: AsyncSession, setup_data):
    rule = setup_data["rule"]
    event = setup_data["event"]

    res = DetectionResult(event_id=event.id, rule_id=rule.id, status="NEW")
    db.add(res)
    await db.flush()
    alert = await AlertService.process_detection(db, res, rule, event)
    await db.commit()

    # resolve directly from OPEN
    res_alert = await AlertService.resolve_alert(db, alert.alert_id)
    await db.commit()
    assert res_alert.status == "RESOLVED"

    # 14. Invalid state transition rejection (Cannot acknowledge a resolved alert)
    bad_ack = await AlertService.acknowledge_alert(db, alert.alert_id)
    assert bad_ack.status == "RESOLVED" # Remains resolved

@pytest.mark.asyncio
async def test_multiple_agents_independent_alerts(db: AsyncSession, setup_data):
    rule = setup_data["rule"]

    # 20. Multiple agents generating independent alerts
    host2 = Host(host_identifier=str(uuid.uuid4()), hostname="host2", operating_system="win")
    db.add(host2)
    await db.flush()

    agent2 = Agent(agent_id=str(uuid.uuid4()), host_id=host2.id, hostname="host2", operating_system="win")
    db.add(agent2)
    await db.flush()

    event1 = setup_data["event"]
    event2 = Event(event_id=str(uuid.uuid4()), timestamp=datetime.now(timezone.utc), agent_id=agent2.id)
    db.add(event2)
    await db.flush()

    res1 = DetectionResult(event_id=event1.id, rule_id=rule.id, status="NEW")
    res2 = DetectionResult(event_id=event2.id, rule_id=rule.id, status="NEW")
    db.add_all([res1, res2])
    await db.flush()

    alert1 = await AlertService.process_detection(db, res1, rule, event1)
    alert2 = await AlertService.process_detection(db, res2, rule, event2)
    await db.commit()

    assert alert1.id != alert2.id
    assert alert1.fingerprint != alert2.fingerprint

@pytest.mark.asyncio
async def test_alert_api_endpoints(client: AsyncClient, setup_data):
    # Retrieve alerts
    res = await client.get("/api/v1/alerts/")
    assert res.status_code == 200
    data = res.json()
    assert "alerts" in data or "items" in data
