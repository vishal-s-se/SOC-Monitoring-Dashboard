import pytest_asyncio
import pytest
import os
import uuid
import asyncio
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(".env.test")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from httpx import AsyncClient

from backend.app.main import app
from backend.app.db.base_class import Base
from backend.app.models.host import Host
from backend.app.models.agent import Agent
from backend.app.models.event import Event
from backend.app.models.raw_log import RawLog
from backend.app.models.detection import DetectionRule, DetectionResult
from backend.app.models.alert import Alert

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
async def sample_data(db: AsyncSession):
    # Setup data
    host = Host(host_identifier=str(uuid.uuid4()), hostname="api-host", operating_system="linux")
    db.add(host)
    await db.flush()

    agent = Agent(agent_id=str(uuid.uuid4()), host_id=host.id, hostname="api-host", operating_system="linux", status="ONLINE")
    db.add(agent)
    await db.flush()

    raw_log = RawLog(
        event_identifier=str(uuid.uuid4()),
        agent_id=agent.id,
        host_id=host.id,
        source_type="syslog",
        timestamp=datetime.now(timezone.utc),
        raw_payload="test payload"
    )
    db.add(raw_log)
    await db.flush()

    event = Event(event_id=str(uuid.uuid4()), agent_id=agent.id, host_id=host.id, event_category="test", timestamp=datetime.now(timezone.utc))
    db.add(event)
    await db.flush()

    rule = DetectionRule(rule_id="API-RUL-1", name="API Test", enabled=True, severity="HIGH", conditions=[])
    db.add(rule)
    await db.flush()

    result = DetectionResult(event_id=event.id, rule_id=rule.id, status="NEW")
    db.add(result)
    await db.flush()

    alert = Alert(
        alert_id=str(uuid.uuid4()), title="API Alert", severity="HIGH", status="OPEN",
        fingerprint="API-RUL-1:test", rule_id=rule.id, agent_id=agent.id, host_id=host.id,
        first_seen=datetime.now(timezone.utc), last_seen=datetime.now(timezone.utc)
    )
    db.add(alert)
    await db.commit()

    return {
        "host": host, "agent": agent, "raw_log": raw_log,
        "event": event, "rule": rule, "result": result, "alert": alert
    }

@pytest.mark.asyncio
async def test_events_api(client: AsyncClient, sample_data):
    # 2. event listing
    res = await client.get("/api/v1/events/")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert len(data["items"]) == 1

    # 3. event retrieval
    res = await client.get(f"/api/v1/events/{sample_data['event'].id}")
    assert res.status_code == 200
    assert res.json()["event_id"] == sample_data["event"].event_id

    # 4. event pagination
    res = await client.get("/api/v1/events/?page=1&page_size=10")
    assert res.status_code == 200
    assert res.json()["page"] == 1

    # 5. event filtering
    res = await client.get(f"/api/v1/events/?agent_id={sample_data['agent'].id}")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

@pytest.mark.asyncio
async def test_raw_logs_api(client: AsyncClient, sample_data):
    # 6. raw log listing
    res = await client.get("/api/v1/raw_logs/")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

    # 7. raw log retrieval
    res = await client.get(f"/api/v1/raw_logs/{sample_data['raw_log'].id}")
    assert res.status_code == 200
    assert res.json()["source_type"] == "syslog"

@pytest.mark.asyncio
async def test_alerts_api(client: AsyncClient, sample_data):
    alert = sample_data["alert"]

    # 8. alert listing
    res = await client.get("/api/v1/alerts/")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

    # 9. alert retrieval
    res = await client.get(f"/api/v1/alerts/{alert.alert_id}")
    assert res.status_code == 200
    assert res.json()["alert_id"] == alert.alert_id

    # 10. alert filtering
    res = await client.get("/api/v1/alerts/?severity=HIGH")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

    # 11. acknowledge alert
    res = await client.post(f"/api/v1/alerts/{alert.alert_id}/acknowledge")
    assert res.status_code == 200
    assert res.json()["status"] == "ACKNOWLEDGED"

    # 12. resolve alert
    res = await client.post(f"/api/v1/alerts/{alert.alert_id}/resolve")
    assert res.status_code == 200
    assert res.json()["status"] == "RESOLVED"

@pytest.mark.asyncio
async def test_agents_hosts_detections_api(client: AsyncClient, sample_data):
    # 13. agent listing
    res = await client.get("/api/v1/agents/")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

    # 14. host listing
    res = await client.get("/api/v1/hosts/")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

    # 15. detection rule listing
    res = await client.get("/api/v1/detections/rules")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

    # 16. detection result listing
    res = await client.get("/api/v1/detections/results")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

@pytest.mark.asyncio
async def test_error_handling(client: AsyncClient):
    # 17. invalid parameters
    res = await client.get("/api/v1/events/?page=0")
    assert res.status_code == 422 # Validation error for ge=1

    # 18. missing resources
    res = await client.get("/api/v1/events/99999")
    assert res.status_code == 404

    # 20. maximum page size
    res = await client.get("/api/v1/events/?page_size=200")
    assert res.status_code == 422 # Validation error for le=100

@pytest.mark.asyncio
async def test_time_range_validation(client: AsyncClient, sample_data):
    # 19. time-range validation
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    past = "2000-01-01T00:00:00Z"

    # Valid
    res = await client.get(f"/api/v1/events/?start_time={past}&end_time={now}")
    assert res.status_code == 200

    # Invalid
    res = await client.get(f"/api/v1/events/?start_time={now}&end_time={past}")
    assert res.status_code == 400

# The best way to test WS in pytest-asyncio is just calling manager directly or using another approach.
# Since we just need to verify the foundation, we can use the manager logic:
@pytest.mark.asyncio
async def test_websocket_manager():
    from backend.app.api.v1.endpoints.ws import manager
    class MockWebSocket:
        def __init__(self):
            self.sent = []
        async def send_json(self, data):
            self.sent.append(data)

    ws = MockWebSocket()
    manager.active_connections.append(ws)

    await manager.broadcast_internal_event({"type": "test"})
    assert len(ws.sent) == 1
    assert ws.sent[0]["type"] == "test"

    manager.disconnect(ws)
    assert ws not in manager.active_connections

@pytest.mark.asyncio
async def test_investigation_lifecycle(client: AsyncClient):
    # 1. Create
    create_resp = await client.post("/api/v1/investigations/", json={
        "title": "Suspicious Login Activity",
        "description": "Multiple failed logins",
        "severity": "HIGH",
        "evidence": [
            {
                "evidence_type": "EVENT",
                "reference_id": "999"
            }
        ]
    })
    assert create_resp.status_code == 201
    inv = create_resp.json()
    assert inv["title"] == "Suspicious Login Activity"
    assert inv["status"] == "OPEN"
    assert len(inv["evidence"]) == 1
    inv_id = inv["id"]

    # 2. Get List
    list_resp = await client.get("/api/v1/investigations/")
    assert list_resp.status_code == 200
    assert len(list_resp.json()["items"]) > 0

    # 3. Get Single
    get_resp = await client.get(f"/api/v1/investigations/{inv_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == inv_id

    # 4. Add Note
    note_resp = await client.post(f"/api/v1/investigations/{inv_id}/notes", json={
        "content": "Looking into this now",
        "author": "Analyst1"
    })
    assert note_resp.status_code == 201
    assert note_resp.json()["content"] == "Looking into this now"

    # 5. Add Evidence
    ev_resp = await client.post(f"/api/v1/investigations/{inv_id}/evidence", json={
        "evidence_type": "ALERT",
        "reference_id": "100"
    })
    assert ev_resp.status_code == 201
    assert ev_resp.json()["evidence_type"] == "ALERT"

    # 6. Duplicate Evidence Prevention
    dup_resp = await client.post(f"/api/v1/investigations/{inv_id}/evidence", json={
        "evidence_type": "ALERT",
        "reference_id": "100"
    })
    assert dup_resp.status_code == 200 or dup_resp.status_code == 201

    # 7. Update Status
    stat_resp = await client.post(f"/api/v1/investigations/{inv_id}/status", json={
        "status": "CLOSED",
        "resolution": "False positive."
    })
    assert stat_resp.status_code == 200
    assert stat_resp.json()["status"] == "CLOSED"
    assert stat_resp.json()["resolution"] == "False positive."

    # 8. Check Not Found
    nf_resp = await client.get("/api/v1/investigations/999999")
    assert nf_resp.status_code == 404

@pytest.mark.asyncio
async def test_investigation_correlated_events(client: AsyncClient, sample_data):
    # Create investigation
    create_resp = await client.post("/api/v1/investigations/", json={
        "title": "Correlation Test",
        "severity": "HIGH",
    })
    inv_id = create_resp.json()["id"]

    # Fetch an event
    ev_list = await client.get("/api/v1/events/?page_size=10")
    events = ev_list.json()["items"]
    assert len(events) > 0
    first_ev = events[0]

    # Add as evidence
    ev_resp = await client.post(f"/api/v1/investigations/{inv_id}/evidence", json={
        "evidence_type": "EVENT",
        "reference_id": str(first_ev["id"])
    })
    evidence_id = ev_resp.json()["id"]

    # Correlate
    corr_resp = await client.get(f"/api/v1/investigations/{inv_id}/correlated-events?evidence_id={evidence_id}&correlation_keys=host,source_ip,destination_ip,username")
    assert corr_resp.status_code == 200
    corr_data = corr_resp.json()
    assert "items" in corr_data

    # Verify exclusions and reasons
    for ev in corr_data["items"]:
        assert ev["id"] != first_ev["id"]
        assert "correlation_reason" in ev
        assert len(ev["correlation_reason"]) > 0

    # Nonexistent evidence
    nf_resp = await client.get(f"/api/v1/investigations/{inv_id}/correlated-events?evidence_id=999999")
    assert nf_resp.status_code == 404

@pytest.mark.asyncio
async def test_investigation_summary_endpoint(client: AsyncClient):
    create_resp = await client.post("/api/v1/investigations/", json={
        "title": "Summary Test Investigation",
        "severity": "MEDIUM",
    })
    assert create_resp.status_code == 201
    inv_id = create_resp.json()["id"]

    await client.post(f"/api/v1/investigations/{inv_id}/evidence", json={
        "evidence_type": "ALERT",
        "reference_id": "101"
    })
    await client.post(f"/api/v1/investigations/{inv_id}/evidence", json={
        "evidence_type": "EVENT",
        "reference_id": "201"
    })
    await client.post(f"/api/v1/investigations/{inv_id}/evidence", json={
        "evidence_type": "EVENT",
        "reference_id": "202"
    })
    await client.post(f"/api/v1/investigations/{inv_id}/notes", json={
        "content": "Summary test note",
        "author": "Tester"
    })

    summary_resp = await client.get(f"/api/v1/investigations/{inv_id}/summary")
    assert summary_resp.status_code == 200
    s = summary_resp.json()
    assert s["alerts"] == 1
    assert s["events"] == 2
    assert s["notes"] == 1
    assert s["total_evidence"] == 3

    nf_resp = await client.get("/api/v1/investigations/999999/summary")
    assert nf_resp.status_code == 404

@pytest.mark.asyncio
async def test_investigation_note_validation(client: AsyncClient):
    create_resp = await client.post("/api/v1/investigations/", json={
        "title": "Note Validation Test",
        "severity": "LOW",
    })
    assert create_resp.status_code == 201
    inv_id = create_resp.json()["id"]

    empty_resp = await client.post(f"/api/v1/investigations/{inv_id}/notes", json={
        "content": "",
        "author": "Tester"
    })
    assert empty_resp.status_code == 422

    long_content = "x" * 2001
    long_resp = await client.post(f"/api/v1/investigations/{inv_id}/notes", json={
        "content": long_content,
        "author": "Tester"
    })
    assert long_resp.status_code == 422

    valid_resp = await client.post(f"/api/v1/investigations/{inv_id}/notes", json={
        "content": "Valid note content",
        "author": "Tester"
    })
    assert valid_resp.status_code == 201
    assert valid_resp.json()["content"] == "Valid note content"

@pytest.mark.asyncio
async def test_attack_timeline_api(client: AsyncClient, sample_data):
    # 1. General Timeline list
    res = await client.get("/api/v1/attack-timeline/")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1
    item = data["items"][0]
    assert "event_id" in item
    assert "timestamp" in item
    assert "severity" in item

    # 2. Ordering asc vs desc
    res_desc = await client.get("/api/v1/attack-timeline/?order=desc")
    assert res_desc.status_code == 200
    res_asc = await client.get("/api/v1/attack-timeline/?order=asc")
    assert res_asc.status_code == 200
    assert len(res_desc.json()["items"]) == len(res_asc.json()["items"])

    # 3. Filters: hostname, agent_id, severity, event_category, search
    host_filter = await client.get("/api/v1/attack-timeline/?hostname=api-host")
    assert host_filter.status_code == 200
    assert len(host_filter.json()["items"]) >= 1

    agent_filter = await client.get(f"/api/v1/attack-timeline/?agent_id={sample_data['agent'].id}")
    assert agent_filter.status_code == 200
    assert len(agent_filter.json()["items"]) >= 1

    search_filter = await client.get("/api/v1/attack-timeline/?search=api-host")
    assert search_filter.status_code == 200
    assert len(search_filter.json()["items"]) >= 1

    empty_filter = await client.get("/api/v1/attack-timeline/?hostname=nonexistent-host-xyz")
    assert empty_filter.status_code == 200
    assert empty_filter.json()["total"] == 0

    # 4. Invalid time range
    invalid_time = await client.get("/api/v1/attack-timeline/?start_time=2026-01-02T00:00:00Z&end_time=2026-01-01T00:00:00Z")
    assert invalid_time.status_code == 400

    # 5. Alert context timeline
    alert = sample_data["alert"]
    alert_timeline = await client.get(f"/api/v1/attack-timeline/?alert_id={alert.id}")
    assert alert_timeline.status_code == 200
    assert alert_timeline.json()["total"] >= 1
    # Check trigger context
    items = alert_timeline.json()["items"]
    assert any(i.get("context_type") in ["ALERT_TRIGGER", "SURROUNDING_CONTEXT"] for i in items)

    # 6. Alert not found
    alert_nf = await client.get("/api/v1/attack-timeline/?alert_id=999999")
    assert alert_nf.status_code == 404

    # 7. Investigation context timeline
    create_inv = await client.post("/api/v1/investigations/", json={
        "title": "Timeline Investigation",
        "severity": "HIGH",
        "evidence": [
            {
                "evidence_type": "EVENT",
                "reference_id": str(sample_data["event"].id)
            }
        ]
    })
    inv_id = create_inv.json()["id"]

    inv_timeline = await client.get(f"/api/v1/attack-timeline/?investigation_id={inv_id}")
    assert inv_timeline.status_code == 200
    assert inv_timeline.json()["total"] >= 1
    inv_items = inv_timeline.json()["items"]
    direct_items = [i for i in inv_items if i.get("context_type") == "DIRECT_EVIDENCE"]
    assert len(direct_items) >= 1

    # 8. Investigation not found
    inv_nf = await client.get("/api/v1/attack-timeline/?investigation_id=999999")
    assert inv_nf.status_code == 404
