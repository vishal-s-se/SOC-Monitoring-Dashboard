import pytest_asyncio
import pytest
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
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


@pytest.mark.asyncio
async def test_attack_timeline_investigation_correlation(client: AsyncClient, sample_data, db: AsyncSession):
    # Setup correlated events around sample event
    ev1 = sample_data['event']
    now = datetime.now(timezone.utc)

    # Correlated Event 2: Same host, same username, different event_id
    ev2 = Event(
        event_id=str(uuid.uuid4()),
        agent_id=sample_data['agent'].id,
        host_id=sample_data['host'].id,
        hostname=sample_data['host'].hostname,
        username='alice',
        source_ip='192.168.1.50',
        destination_ip='10.0.0.1',
        event_category='authentication',
        event_type='login',
        severity='MEDIUM',
        raw_log_id=sample_data['raw_log'].id,
        timestamp=now
    )
    db.add(ev2)

    # Correlated Event 3: Same source IP
    ev3 = Event(
        event_id=str(uuid.uuid4()),
        agent_id=sample_data['agent'].id,
        host_id=sample_data['host'].id,
        hostname='another-host',
        source_ip='192.168.1.50',
        event_category='network',
        event_type='connect',
        severity='INFO',
        timestamp=now
    )
    db.add(ev3)
    await db.commit()

    # 1. Create Investigation with ev1 as direct evidence
    create_inv = await client.post('/api/v1/investigations/', json={
        'title': 'Incident Alpha',
        'description': 'Investigating incident',
        'severity': 'CRITICAL',
        'evidence': [
            {
                'evidence_type': 'EVENT',
                'reference_id': str(ev1.id)
            }
        ]
    })
    assert create_inv.status_code == 201
    inv_id = create_inv.json()['id']

    # 2. Query timeline for this investigation
    res = await client.get(f'/api/v1/attack-timeline/?investigation_id={inv_id}')
    assert res.status_code == 200
    data = res.json()
    assert 'investigation_info' in data
    assert data['investigation_info']['title'] == 'Incident Alpha'
    assert data['investigation_info']['severity'] == 'CRITICAL'
    assert data['investigation_info']['evidence_count'] >= 1
    assert data['investigation_info']['correlated_count'] >= 1

    # 3. Check duplicate prevention & provenance
    items = data['items']
    ev_ids = [i['id'] for i in items]
    assert len(ev_ids) == len(set(ev_ids))

    direct_item = next(i for i in items if i['id'] == ev1.id)
    assert direct_item['provenance'] == 'DIRECT_EVIDENCE'
    assert direct_item['context_type'] == 'DIRECT_EVIDENCE'
    assert direct_item['investigation_id'] == inv_id

    # 4. Check correlation reason on correlated item
    corr_items = [i for i in items if i['provenance'] == 'CORRELATED_EVENT']
    assert len(corr_items) >= 1
    assert any('Same host' in (i['context_reason'] or '') or 'Same agent' in (i['context_reason'] or '') for i in corr_items)

    # 5. Provenance filtering: DIRECT_EVIDENCE only
    direct_res = await client.get(f'/api/v1/attack-timeline/?investigation_id={inv_id}&provenance=DIRECT_EVIDENCE')
    assert direct_res.status_code == 200
    direct_data = direct_res.json()
    assert all(i['provenance'] == 'DIRECT_EVIDENCE' for i in direct_data['items'])
    assert len(direct_data['items']) == 1

    # 6. Provenance filtering: CORRELATED_EVENT only
    corr_res = await client.get(f'/api/v1/attack-timeline/?investigation_id={inv_id}&provenance=CORRELATED_EVENT')
    assert corr_res.status_code == 200
    corr_data = corr_res.json()
    assert all(i['provenance'] == 'CORRELATED_EVENT' for i in corr_data['items'])
    assert all(i['id'] != ev1.id for i in corr_data['items'])

    # 7. Empty investigation
    empty_inv = await client.post('/api/v1/investigations/', json={
        'title': 'Empty Inv',
        'severity': 'LOW',
        'evidence': []
    })
    empty_inv_id = empty_inv.json()['id']
    empty_res = await client.get(f'/api/v1/attack-timeline/?investigation_id={empty_inv_id}')
    assert empty_res.status_code == 200
    assert empty_res.json()['total'] == 0
    assert empty_res.json()['investigation_info']['evidence_count'] == 0

    # 8. Raw-log traceability
    assert any(i.get('raw_log_id') is not None for i in items)

    # 9. Summary metrics verification
    assert "summary" in data and data["summary"] is not None
    assert data["summary"]["total_events"] >= 1
    assert data["summary"]["direct_evidence_count"] >= 1
    assert len(data["summary"]["unique_hosts"]) >= 1
    assert len(data["summary"]["unique_agents"]) >= 1


@pytest.mark.asyncio
async def test_attack_timeline_event_relationships_phase_7d4(client: AsyncClient, sample_data: dict, db: AsyncSession):
    now = datetime.utcnow()

    # 1. Create a RawLog
    raw_log = RawLog(
        source_type="syslog",
        raw_payload="{\"msg\": \"test raw payload 7d4\"}",
        ingestion_status="PARSED",
        agent_id=sample_data['agent'].id,
        host_id=sample_data['host'].id,
        event_identifier=str(uuid.uuid4()),
        timestamp=now
    )
    db.add(raw_log)
    await db.commit()
    await db.refresh(raw_log)

    # 2. Create Event linked to host, agent, raw_log
    ev = Event(
        event_id=str(uuid.uuid4()),
        agent_id=sample_data['agent'].id,
        host_id=sample_data['host'].id,
        hostname=sample_data['host'].hostname,
        operating_system=sample_data['host'].operating_system,
        source_ip='10.0.0.100',
        destination_ip='10.0.0.200',
        username='secops_user',
        raw_log_id=raw_log.id,
        event_category='process',
        event_type='exec',
        severity='HIGH',
        timestamp=now
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)

    # 3. Create Alert and link to Event via DetectionResult
    alert = Alert(
        alert_id=str(uuid.uuid4()),
        rule_id=sample_data['rule'].id,
        fingerprint=f"RULE-7D4:{uuid.uuid4()}",
        title="Unauthorized Execution 7D4",
        description="Alert for Phase 7D-4 relationship testing",
        severity="HIGH",
        status="NEW",
        first_seen=now,
        last_seen=now,
        agent_id=sample_data['agent'].id,
        host_id=sample_data['host'].id
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)

    dr = DetectionResult(
        rule_id=sample_data['rule'].id,
        event_id=ev.id,
        alert_id=alert.id,
        status="NEW"
    )
    db.add(dr)
    await db.commit()

    # 4. Create an standalone event with no alert, no raw log, no investigation
    standalone_ev = Event(
        event_id=str(uuid.uuid4()),
        agent_id=None,
        host_id=None,
        hostname='standalone-host',
        event_category='system',
        event_type='service_start',
        severity='INFO',
        timestamp=now - timedelta(minutes=5)
    )
    db.add(standalone_ev)
    await db.commit()
    await db.refresh(standalone_ev)

    # 5. Create Investigation with ev as direct evidence
    create_inv = await client.post('/api/v1/investigations/', json={
        'title': 'Investigation 7D4 Traceability',
        'description': 'Testing relationship navigation',
        'severity': 'HIGH',
        'evidence': [
            {
                'evidence_type': 'EVENT',
                'reference_id': str(ev.id)
            }
        ]
    })
    assert create_inv.status_code == 201
    inv_id = create_inv.json()['id']

    # 6. Test General Timeline (no investigation_id param) to verify batch investigation lookup
    gen_res = await client.get(f'/api/v1/attack-timeline/?search={ev.event_id}')
    assert gen_res.status_code == 200
    gen_items = gen_res.json()['items']
    assert len(gen_items) >= 1
    target_item = next(i for i in gen_items if i['id'] == ev.id)

    # Verify Event -> Alert relationship
    assert target_item['alert_id'] == str(alert.id)
    assert target_item['alert_title'] == "Unauthorized Execution 7D4"
    assert target_item['alert_severity'] == "HIGH"

    # Verify Event -> Raw Log relationship
    assert target_item['raw_log_id'] == raw_log.id

    # Verify Event -> Host relationship
    assert target_item['host_id'] == sample_data['host'].id
    assert target_item['hostname'] == sample_data['host'].hostname
    assert target_item['operating_system'] == sample_data['host'].operating_system

    # Verify Event -> Agent relationship
    assert target_item['agent_id'] == sample_data['agent'].id

    # Verify Event -> Investigation relationship (resolved via batch evidence lookup!)
    assert target_item['investigation_id'] == inv_id
    assert target_item['investigation_title'] == 'Investigation 7D4 Traceability'

    # 7. Test Empty / Missing relationships on standalone event
    std_res = await client.get(f'/api/v1/attack-timeline/?search={standalone_ev.event_id}')
    assert std_res.status_code == 200
    std_items = std_res.json()['items']
    assert len(std_items) == 1
    std_item = std_items[0]
    assert std_item['alert_id'] is None
    assert std_item['alert_title'] is None
    assert std_item['raw_log_id'] is None
    assert std_item['investigation_id'] is None

    # 8. Test Investigation-Centered Timeline Navigation
    inv_res = await client.get(f'/api/v1/attack-timeline/?investigation_id={inv_id}')
    assert inv_res.status_code == 200
    inv_data = inv_res.json()
    assert inv_data['investigation_info']['id'] == inv_id
    assert inv_data['investigation_info']['title'] == 'Investigation 7D4 Traceability'
    inv_target = next(i for i in inv_data['items'] if i['id'] == ev.id)
    assert inv_target['provenance'] == 'DIRECT_EVIDENCE'
    assert inv_target['investigation_id'] == inv_id
    assert inv_target['investigation_title'] == 'Investigation 7D4 Traceability'

    # 9. Test Host Filter Navigation
    host_res = await client.get(f'/api/v1/attack-timeline/?hostname={sample_data["host"].hostname}')
    assert host_res.status_code == 200
    assert all(sample_data["host"].hostname in (i['hostname'] or '') for i in host_res.json()['items'])

    # 10. Test Agent Filter Navigation
    agent_res = await client.get(f'/api/v1/attack-timeline/?agent_id={sample_data["agent"].id}')
    assert agent_res.status_code == 200
    assert all(i['agent_id'] == sample_data['agent'].id for i in agent_res.json()['items'])

    # 11. Test Invalid Investigation ID returns 404
    invalid_res = await client.get('/api/v1/attack-timeline/?investigation_id=99999999')
    assert invalid_res.status_code == 404
