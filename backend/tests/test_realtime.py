import pytest_asyncio
import pytest
import uuid
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
import os

from backend.app.models.agent import Agent
from backend.app.models.host import Host
from backend.app.models.detection import DetectionRule, DetectionResult
from backend.app.models.event import Event
from backend.app.db.base_class import Base

from backend.app.engine.event_bus import event_bus
from backend.app.engine.alerter import AlertService
from collector.app.pipeline import process_event
from collector.app.schemas import EventRequest
from dotenv import load_dotenv

load_dotenv(".env.test")

# Test DB setup
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
async def setup_data(db: AsyncSession):
    host = Host(host_identifier=str(uuid.uuid4()), hostname="realtime-host", operating_system="linux")
    db.add(host)
    await db.flush()

    agent = Agent(agent_id=str(uuid.uuid4()), host_id=host.id, hostname="realtime-host", operating_system="linux", status="ONLINE")
    db.add(agent)
    await db.flush()

    rule = DetectionRule(rule_id="RT-1", name="Realtime Rule", enabled=True, severity="HIGH", conditions=[])
    db.add(rule)
    await db.commit()
    
    return {"host": host, "agent": agent, "rule": rule}

class MockSubscriber:
    def __init__(self):
        self.events = []
    async def __call__(self, event: dict):
        self.events.append(event)

@pytest.mark.asyncio
async def test_realtime_pipeline(db: AsyncSession, setup_data):
    # Setup mock subscriber
    subscriber = MockSubscriber()
    event_bus.subscribe(subscriber)
    
    agent = setup_data["agent"]
    rule = setup_data["rule"]

    # 1. new_event published
    import json
    event_req = EventRequest(
        event_id=str(uuid.uuid4()),
        agent_id=agent.agent_id,
        hostname=agent.hostname,
        source="syslog",
        timestamp=datetime.now(timezone.utc),
        payload=json.dumps({"msg": "test real-time"}),
        event_type="test"
    )
    
    await process_event(event_req, agent, db)
    
    # event_bus processes in background? No, in tests we might need to await the queue 
    # OR we can just directly test it if event_bus is running.
    # Wait, in the test, event_bus is a global instance, but we need to ensure its background task is running, 
    # OR we just pull from the queue directly!
    
    # Start event bus to process the queue
    event_bus.start()
    
    # Wait a tiny bit for the queue to process
    await asyncio.sleep(0.1)
    
    assert any(e["type"] == "new_event" for e in subscriber.events)
    new_event = [e for e in subscriber.events if e["type"] == "new_event"][-1]
    assert "timestamp" in new_event
    assert new_event["data"]["event_id"] == event_req.event_id

    # 2. new_alert published
    # Create an event manually for the alert service
    test_event = Event(event_id=str(uuid.uuid4()), agent_id=agent.id, host_id=agent.host_id, timestamp=datetime.now(timezone.utc))
    db.add(test_event)
    await db.flush()
    
    det = DetectionResult(event_id=test_event.id, rule_id=rule.id, status="NEW")
    db.add(det)
    await db.flush()
    
    alert = await AlertService.process_detection(db, det, rule, test_event)
    await asyncio.sleep(0.1)
    
    print(f"DEBUG EVENTS: {subscriber.events}")
    
    assert any(e["type"] == "new_alert" for e in subscriber.events)
    new_alert = [e for e in subscriber.events if e["type"] == "new_alert"][-1]
    assert new_alert["data"]["alert_id"] == alert.alert_id

    # 3. existing alert updated
    det2 = DetectionResult(event_id=test_event.id, rule_id=rule.id, status="NEW")
    db.add(det2)
    await db.flush()
    await AlertService.process_detection(db, det2, rule, test_event)
    await asyncio.sleep(0.1)
    
    assert any(e["type"] == "alert_updated" for e in subscriber.events)
    alert_updated = [e for e in subscriber.events if e["type"] == "alert_updated"][-1]
    assert alert_updated["data"]["occurrence_count"] == 2

    # 4. acknowledge
    await AlertService.acknowledge_alert(db, alert.alert_id)
    await asyncio.sleep(0.1)
    ack_event = [e for e in subscriber.events if e["type"] == "alert_updated"][-1]
    assert ack_event["data"]["status"] == "ACKNOWLEDGED"

    # 5. resolve
    await AlertService.resolve_alert(db, alert.alert_id)
    await asyncio.sleep(0.1)
    res_event = [e for e in subscriber.events if e["type"] == "alert_updated"][-1]
    assert res_event["data"]["status"] == "RESOLVED"

    # 6. agent status transition
    from collector.app.routes import receive_heartbeat, register_agent
    from collector.app.schemas import HeartbeatRequest, AgentRegistration
    hb_req = HeartbeatRequest(
        agent_id=agent.agent_id,
        hostname=agent.hostname,
        agent_version="1.0.0",
        connection_status="OFFLINE",
        timestamp=datetime.now(timezone.utc)
    )
    await receive_heartbeat(hb_req, db, "test-token")
    await asyncio.sleep(0.1)
    
    assert any(e["type"] == "agent_status_changed" for e in subscriber.events)
    status_event = [e for e in subscriber.events if e["type"] == "agent_status_changed"][-1]
    assert status_event["data"]["status"] == "OFFLINE"
    
    # 7. host status transition (via new registration)
    reg_req = AgentRegistration(
        agent_id="new-agent-123",
        hostname="new-host-123",
        operating_system="windows",
        agent_version="1.0.0",
        ip_address="192.168.1.1"
    )
    await register_agent(reg_req, db, "test-token")
    await asyncio.sleep(0.1)
    
    assert any(e["type"] == "host_status_changed" for e in subscriber.events)
    host_event = next(e for e in subscriber.events if e["type"] == "host_status_changed")
    assert host_event["data"]["hostname"] == "new-host-123"

    # 13, 14. no duplicate new_alert or new_event
    initial_event_count = sum(1 for e in subscriber.events if e["type"] == "new_event")
    initial_alert_count = sum(1 for e in subscriber.events if e["type"] == "new_alert")
    
    # duplicate event
    await process_event(event_req, agent, db)
    await asyncio.sleep(0.1)
    new_event_count = sum(1 for e in subscriber.events if e["type"] == "new_event")
    assert new_event_count == initial_event_count # Should not increase
    
    # Cleanup
    event_bus.unsubscribe(subscriber)
    event_bus.stop()

@pytest.mark.asyncio
async def test_websocket_manager_isolation():
    from backend.app.api.v1.endpoints.ws import ConnectionManager
    manager = ConnectionManager()
    
    class MockClient:
        def __init__(self, should_fail=False):
            self.events = []
            self.should_fail = should_fail
        async def send_json(self, data):
            if self.should_fail:
                raise Exception("Network error")
            self.events.append(data)
            
    c1 = MockClient()
    c2 = MockClient(should_fail=True)
    c3 = MockClient()
    
    manager.active_connections.extend([c1, c2, c3])
    
    await manager.broadcast_internal_event({"type": "test"})
    
    # c1 and c3 should have received it
    assert len(c1.events) == 1
    assert len(c3.events) == 1
    
    # c2 should have failed and been disconnected
    assert len(c2.events) == 0
    assert c2 not in manager.active_connections
    assert c1 in manager.active_connections
    assert c3 in manager.active_connections
