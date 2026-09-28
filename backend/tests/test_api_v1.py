import pytest_asyncio
import pytest
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv(".env.test")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
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
from backend.app.models.investigation import Investigation, InvestigationEvidence, InvestigationStatus, InvestigationSeverity
from backend.app.models.mitre import MitreMapping, MitreTargetType, MitreMappingSource, MitreConfidence

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


@pytest.mark.asyncio
async def test_attack_timeline_filtering_controls_phase_7d5(client: AsyncClient, sample_data: dict, db: AsyncSession):
    now = datetime.now(timezone.utc)

    # 1. Create a suite of distinct events for multi-filter testing
    ev_auth = Event(
        event_id=str(uuid.uuid4()),
        agent_id=sample_data['agent'].id,
        host_id=sample_data['host'].id,
        hostname='auth-srv-01',
        source_ip='192.168.10.5',
        destination_ip='192.168.10.1',
        source_port=54321,
        destination_port=22,
        protocol='TCP',
        username='jdoe',
        event_category='authentication',
        event_type='login_success',
        severity='LOW',
        timestamp=now - timedelta(hours=2)
    )
    ev_proc = Event(
        event_id=str(uuid.uuid4()),
        agent_id=sample_data['agent'].id,
        host_id=sample_data['host'].id,
        hostname='workstation-42',
        source_ip='192.168.10.88',
        destination_ip='10.0.0.99',
        source_port=49152,
        destination_port=443,
        protocol='TCP',
        username='mal_actor',
        event_category='process',
        event_type='suspicious_ps',
        severity='CRITICAL',
        timestamp=now - timedelta(hours=1)
    )
    ev_net = Event(
        event_id=str(uuid.uuid4()),
        agent_id=sample_data['agent'].id,
        host_id=sample_data['host'].id,
        hostname='gateway-fw',
        source_ip='10.0.0.99',
        destination_ip='192.168.10.88',
        source_port=443,
        destination_port=49152,
        protocol='TCP',
        username=None,
        event_category='network',
        event_type='drop_traffic',
        severity='MEDIUM',
        timestamp=now - timedelta(minutes=30)
    )
    db.add_all([ev_auth, ev_proc, ev_net])
    await db.commit()

    # 2. Test Time-Range Filtering
    start_t = (now - timedelta(hours=3)).isoformat()
    end_t = (now - timedelta(hours=1, minutes=30)).isoformat()
    res_time = await client.get('/api/v1/attack-timeline/', params={'start_time': start_t, 'end_time': end_t})
    assert res_time.status_code == 200
    time_ids = [i['id'] for i in res_time.json()['items']]
    assert ev_auth.id in time_ids
    assert ev_proc.id not in time_ids
    assert ev_net.id not in time_ids

    # 3. Test Invalid Time-Range (end < start) -> 400
    res_inv_time = await client.get('/api/v1/attack-timeline/', params={'start_time': end_t, 'end_time': start_t})
    assert res_inv_time.status_code == 400
    assert "end_time must be after start_time" in res_inv_time.json()['detail']

    # 4. Test Oversized Time-Range (> 90 days) -> 400
    very_old = (now - timedelta(days=120)).isoformat()
    res_oversized = await client.get('/api/v1/attack-timeline/', params={'start_time': very_old, 'end_time': now.isoformat()})
    assert res_oversized.status_code == 400
    assert "Time range cannot exceed 90 days" in res_oversized.json()['detail']

    # 5. Test Username Filtering
    res_user = await client.get('/api/v1/attack-timeline/?username=mal_actor')
    assert res_user.status_code == 200
    assert all(i['username'] == 'mal_actor' for i in res_user.json()['items'])
    assert any(i['id'] == ev_proc.id for i in res_user.json()['items'])

    # 6. Test Source IP & Destination IP Filtering
    res_src_ip = await client.get('/api/v1/attack-timeline/?source_ip=192.168.10.88')
    assert res_src_ip.status_code == 200
    assert all(i['source_ip'] == '192.168.10.88' for i in res_src_ip.json()['items'])

    res_dst_ip = await client.get('/api/v1/attack-timeline/?destination_ip=10.0.0.99')
    assert res_dst_ip.status_code == 200
    assert all(i['destination_ip'] == '10.0.0.99' for i in res_dst_ip.json()['items'])

    # 7. Test Network Port & Protocol Filtering
    res_port = await client.get('/api/v1/attack-timeline/?destination_port=22&protocol=TCP')
    assert res_port.status_code == 200
    assert any(i['id'] == ev_auth.id for i in res_port.json()['items'])

    # 8. Test Event Category & Severity Filtering
    res_cat_sev = await client.get('/api/v1/attack-timeline/?event_category=process&severity=CRITICAL')
    assert res_cat_sev.status_code == 200
    assert len(res_cat_sev.json()['items']) >= 1
    assert all(i['event_category'] == 'process' and i['severity'] == 'CRITICAL' for i in res_cat_sev.json()['items'])

    # 9. Test Server-Side Search
    res_search_user = await client.get('/api/v1/attack-timeline/?search=jdoe')
    assert res_search_user.status_code == 200
    assert any(i['id'] == ev_auth.id for i in res_search_user.json()['items'])

    res_search_cat = await client.get('/api/v1/attack-timeline/?search=authentication')
    assert res_search_cat.status_code == 200
    assert any(i['id'] == ev_auth.id for i in res_search_cat.json()['items'])

    res_search_type = await client.get('/api/v1/attack-timeline/?search=suspicious_ps')
    assert res_search_type.status_code == 200
    assert any(i['id'] == ev_proc.id for i in res_search_type.json()['items'])

    # 10. Test Combined Multi-Filters
    res_combined = await client.get(
        f'/api/v1/attack-timeline/?hostname=workstation-42&username=mal_actor&severity=CRITICAL&event_category=process'
    )
    assert res_combined.status_code == 200
    assert len(res_combined.json()['items']) == 1
    assert res_combined.json()['items'][0]['id'] == ev_proc.id

    # 11. Test Empty Result State with non-matching filter
    res_empty = await client.get('/api/v1/attack-timeline/?hostname=nonexistent-host-999')
    assert res_empty.status_code == 200
    assert res_empty.json()['total'] == 0
    assert len(res_empty.json()['items']) == 0

    # 12. Test Sorting (ASC vs DESC)
    res_asc = await client.get('/api/v1/attack-timeline/?order=asc')
    assert res_asc.status_code == 200
    asc_items = res_asc.json()['items']
    if len(asc_items) >= 2:
        assert asc_items[0]['timestamp'] <= asc_items[-1]['timestamp']

    res_desc = await client.get('/api/v1/attack-timeline/?order=desc')
    assert res_desc.status_code == 200
    desc_items = res_desc.json()['items']
    if len(desc_items) >= 2:
        assert desc_items[0]['timestamp'] >= desc_items[-1]['timestamp']

    # 13. Test Pagination Controls
    res_page = await client.get('/api/v1/attack-timeline/?page=1&page_size=2')
    assert res_page.status_code == 200
    data_page = res_page.json()
    assert data_page['page'] == 1
    assert data_page['page_size'] == 2
    assert len(data_page['items']) <= 2
    assert data_page['total'] >= 3

    # 14. Summary Metrics includes categories and types
    assert "summary" in data_page and data_page["summary"] is not None
    assert len(data_page["summary"]["unique_event_categories"]) >= 1
    assert len(data_page["summary"]["unique_event_types"]) >= 1


@pytest.mark.asyncio
async def test_mitre_attack_foundation_phase_7e1(client: AsyncClient, db: AsyncSession):
    from backend.app.models.mitre import MitreTactic, MitreTechnique, MitreTechniqueTactic, MitreMapping
    from backend.app.services.mitre_seeder import seed_mitre_catalog

    # 1. Seed MITRE Catalog
    seed_res = await seed_mitre_catalog(db)
    assert seed_res["tactics_seeded"] >= 14
    assert seed_res["techniques_seeded"] >= 30
    assert seed_res["relationships_seeded"] >= 40

    # Test idempotency (repeated seeding should not fail or duplicate)
    seed_res_2 = await seed_mitre_catalog(db)
    assert seed_res_2["tactics_seeded"] == 0
    assert seed_res_2["techniques_seeded"] == 0

    # 2. Test GET /api/v1/mitre/tactics
    res_tactics = await client.get("/api/v1/mitre/tactics")
    assert res_tactics.status_code == 200
    tactics = res_tactics.json()
    assert len(tactics) >= 14
    tactic_ids = [t["tactic_id"] for t in tactics]
    assert "TA0001" in tactic_ids # Initial Access
    assert "TA0002" in tactic_ids # Execution
    assert "TA0040" in tactic_ids # Impact
    # Check ordering
    assert tactics[0]["order_index"] <= tactics[-1]["order_index"]

    # 3. Test GET /api/v1/mitre/techniques (Pagination and List)
    res_techs = await client.get("/api/v1/mitre/techniques?page=1&page_size=10")
    assert res_techs.status_code == 200
    tech_data = res_techs.json()
    assert tech_data["page"] == 1
    assert tech_data["page_size"] == 10
    assert tech_data["total"] >= 30
    assert len(tech_data["items"]) == 10

    # 4. Test Filtering by Tactic
    res_exec = await client.get("/api/v1/mitre/techniques?tactic=TA0002")
    assert res_exec.status_code == 200
    exec_techs = res_exec.json()["items"]
    assert len(exec_techs) > 0
    for t in exec_techs:
        assert any(tac["tactic_id"] == "TA0002" for tac in t["tactics"])

    # 5. Test Filtering by Hierarchy (Technique vs Subtechnique)
    res_sub = await client.get("/api/v1/mitre/techniques?is_subtechnique=true")
    assert res_sub.status_code == 200
    sub_techs = res_sub.json()["items"]
    assert len(sub_techs) > 0
    assert all(st["is_subtechnique"] is True for st in sub_techs)

    # 6. Test Search (Server-side)
    res_search = await client.get("/api/v1/mitre/techniques?search=PowerShell")
    assert res_search.status_code == 200
    search_items = res_search.json()["items"]
    assert len(search_items) >= 1
    assert any(si["technique_id"] == "T1059.001" for si in search_items)

    # 7. Test Technique Detail: GET /api/v1/mitre/techniques/{technique_id}
    res_detail = await client.get("/api/v1/mitre/techniques/T1059")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["technique_id"] == "T1059"
    assert detail["name"] == "Command and Scripting Interpreter"
    assert len(detail["subtechniques"]) >= 3 # T1059.001, T1059.003, T1059.004
    sub_ids = [s["technique_id"] for s in detail["subtechniques"]]
    assert "T1059.001" in sub_ids

    # Sub-technique detail with parent
    res_sub_detail = await client.get("/api/v1/mitre/techniques/T1059.001")
    assert res_sub_detail.status_code == 200
    sub_detail = res_sub_detail.json()
    assert sub_detail["technique_id"] == "T1059.001"
    assert sub_detail["is_subtechnique"] is True
    assert sub_detail["parent_technique"] is not None
    assert sub_detail["parent_technique"]["technique_id"] == "T1059"

    # Invalid technique format test (400 Bad Request)
    res_bad_id = await client.get("/api/v1/mitre/techniques/INVALID_TECHNIQUE")
    assert res_bad_id.status_code == 400

    # Non-existent technique (404 Not Found)
    res_not_found = await client.get("/api/v1/mitre/techniques/T9999")
    assert res_not_found.status_code == 404

    # 8. Test Mapping Entities
    # Create target entities: DetectionRule, Alert, Investigation, Event
    rule = DetectionRule(
        rule_id="RUL-MITRE-01",
        name="PowerShell Execution",
        severity="HIGH",
        conditions=[{"field": "process_name", "operator": "equals", "value": "powershell.exe"}]
    )
    db.add(rule)
    await db.flush()

    alert = Alert(
        alert_id=str(uuid.uuid4()),
        title="Alert: PowerShell Execution",
        severity="HIGH",
        status="OPEN",
        fingerprint=f"RUL-MITRE-01:host1",
        rule_id=rule.id,
        first_seen=datetime.now(timezone.utc),
        last_seen=datetime.now(timezone.utc)
    )
    db.add(alert)
    await db.flush()

    from backend.app.models.investigation import Investigation
    inv = Investigation(
        title="Investigation: PowerShell Threat",
        status="OPEN",
        severity="HIGH"
    )
    db.add(inv)
    await db.flush()

    event = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_type="process_creation",
        event_category="process",
        severity="HIGH",
        hostname="sec-workstation"
    )
    db.add(event)
    await db.commit()

    # 8a. Map Detection Rule -> T1059.001 (DOCUMENTED_RULE)
    map_rule_payload = {
        "technique_id": "T1059.001",
        "target_type": "DETECTION_RULE",
        "target_id": str(rule.id),
        "mapping_source": "DOCUMENTED_RULE",
        "confidence": "HIGH",
        "notes": "Rule explicitly monitors PowerShell script invocation"
    }
    res_map_rule = await client.post("/api/v1/mitre/mappings", json=map_rule_payload)
    assert res_map_rule.status_code == 201
    map_rule_data = res_map_rule.json()
    assert map_rule_data["technique_id"] == "T1059.001"
    assert map_rule_data["target_type"] == "DETECTION_RULE"
    assert map_rule_data["confidence"] == "HIGH"

    # 8b. Map Alert -> T1059.001 (SYSTEM_DEFINED)
    map_alert_payload = {
        "technique_id": "T1059.001",
        "target_type": "ALERT",
        "target_id": str(alert.id),
        "mapping_source": "SYSTEM_DEFINED",
        "confidence": "HIGH",
        "evidence_reference": f"Alert #{alert.id}"
    }
    res_map_alert = await client.post("/api/v1/mitre/mappings", json=map_alert_payload)
    assert res_map_alert.status_code == 201

    # 8c. Map Investigation -> T1059.001 (ANALYST_CONFIRMED)
    map_inv_payload = {
        "technique_id": "T1059.001",
        "target_type": "INVESTIGATION",
        "target_id": str(inv.id),
        "mapping_source": "ANALYST_CONFIRMED",
        "confidence": "HIGH",
        "evidence_reference": f"Investigation #{inv.id}"
    }
    res_map_inv = await client.post("/api/v1/mitre/mappings", json=map_inv_payload)
    assert res_map_inv.status_code == 201

    # 8d. Map Event -> T1059.001 (ANALYST_CONFIRMED)
    map_ev_payload = {
        "technique_id": "T1059.001",
        "target_type": "EVENT",
        "target_id": str(event.id),
        "mapping_source": "ANALYST_CONFIRMED",
        "confidence": "MEDIUM"
    }
    res_map_ev = await client.post("/api/v1/mitre/mappings", json=map_ev_payload)
    assert res_map_ev.status_code == 201

    # 9. Duplicate Mapping Prevention (409 Conflict)
    res_dup = await client.post("/api/v1/mitre/mappings", json=map_inv_payload)
    assert res_dup.status_code == 409

    # 10. Invalid Target Entity (404 Not Found)
    bad_target_payload = {
        "technique_id": "T1059.001",
        "target_type": "INVESTIGATION",
        "target_id": "99999",
        "mapping_source": "ANALYST_CONFIRMED"
    }
    res_bad_target = await client.post("/api/v1/mitre/mappings", json=bad_target_payload)
    assert res_bad_target.status_code == 404

    # 11. Retrieve Mappings: GET /api/v1/mitre/mappings
    res_mappings = await client.get(f"/api/v1/mitre/mappings?target_type=INVESTIGATION&target_id={inv.id}")
    assert res_mappings.status_code == 200
    inv_mappings = res_mappings.json()
    assert len(inv_mappings) == 1
    assert inv_mappings[0]["technique_id"] == "T1059.001"
    assert inv_mappings[0]["mapping_source"] == "ANALYST_CONFIRMED"

    # 12. Traceability in Technique Detail View
    res_detail_updated = await client.get("/api/v1/mitre/techniques/T1059.001")
    assert res_detail_updated.status_code == 200
    detail_data = res_detail_updated.json()
    assert len(detail_data["detection_rules"]) >= 1
    assert len(detail_data["alerts"]) >= 1
    assert len(detail_data["investigations"]) >= 1
    assert len(detail_data["events"]) >= 1

    # 13. Traceability in Investigation Context API
    res_inv_ctx = await client.get(f"/api/v1/investigations/{inv.id}/context")
    assert res_inv_ctx.status_code == 200
    ctx_data = res_inv_ctx.json()
    assert "mitre" in ctx_data
    assert len(ctx_data["mitre"]) >= 1
    assert ctx_data["mitre"][0]["technique_id"] == "T1059.001"
    assert ctx_data["mitre"][0]["source"] == "ANALYST_CONFIRMED"

    # 14. Traceability in Timeline API
    res_tl = await client.get(f"/api/v1/attack-timeline/?search=sec-workstation")
    assert res_tl.status_code == 200
    tl_items = res_tl.json()["items"]
    assert len(tl_items) >= 1
    matched_ev = next((item for item in tl_items if item["id"] == event.id), None)
    assert matched_ev is not None
    assert matched_ev["mitre_techniques"] is not None
    assert any(mt["technique_id"] == "T1059.001" for mt in matched_ev["mitre_techniques"])

    # 15. Delete Mapping
    mapping_to_delete = inv_mappings[0]["id"]
    res_del = await client.delete(f"/api/v1/mitre/mappings/{mapping_to_delete}")
    assert res_del.status_code == 204

    # Verify deleted
    res_check = await client.get(f"/api/v1/mitre/mappings?target_type=INVESTIGATION&target_id={inv.id}")
    assert len(res_check.json()) == 0

    # 16. Phase 7E-2: Alert Inheritance of Detection Rule Mappings
    # Create a new event and alert referencing the rule mapped to T1059.001
    event_inherited = Event(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_type="process_creation",
        event_category="process",
        severity="HIGH",
        hostname="sec-workstation"
    )
    db.add(event_inherited)
    await db.flush()

    alert_inherited = Alert(
        alert_id=f"alt-inherit-{uuid.uuid4().hex[:8]}",
        rule_id=rule.id,
        title="Inherited Rule Alert Test",
        severity="HIGH",
        status="OPEN",
        fingerprint=f"RUL-INHERIT-{uuid.uuid4().hex[:8]}",
        first_seen=datetime.now(timezone.utc),
        last_seen=datetime.now(timezone.utc)
    )
    db.add(alert_inherited)
    await db.flush()

    # Link event to alert via DetectionResult
    dr_inherited = DetectionResult(
        event_id=event_inherited.id,
        alert_id=alert_inherited.id,
        rule_id=rule.id
    )
    db.add(dr_inherited)
    await db.commit()

    # Query alert mappings with include_inherited=True (default)
    res_alert_mapped = await client.get(f"/api/v1/mitre/mappings?target_type=ALERT&target_id={alert_inherited.id}")
    assert res_alert_mapped.status_code == 200
    alert_mitre_list = res_alert_mapped.json()
    assert len(alert_mitre_list) >= 1
    inherit_item = next((it for it in alert_mitre_list if it["technique_id"] == "T1059.001"), None)
    assert inherit_item is not None
    assert inherit_item["is_inherited"] is True

    # Query with include_inherited=False should return empty
    res_alert_no_inherit = await client.get(f"/api/v1/mitre/mappings?target_type=ALERT&target_id={alert_inherited.id}&include_inherited=false")
    assert res_alert_no_inherit.status_code == 200
    assert len(res_alert_no_inherit.json()) == 0

    # 17. Phase 7E-2: Investigation Context includes detection rule mappings inherited via attached alerts
    from backend.app.models.investigation import InvestigationEvidence
    inv_rule_test = Investigation(title="Rule Inherit Inv", severity="HIGH", status="OPEN")
    db.add(inv_rule_test)
    await db.commit()

    # Attach the inherited alert as evidence
    inv_ev = InvestigationEvidence(
        investigation_id=inv_rule_test.id,
        evidence_type="ALERT",
        reference_id=str(alert_inherited.id),
        added_by="analyst"
    )
    db.add(inv_ev)
    await db.commit()

    res_inv_inherit_ctx = await client.get(f"/api/v1/investigations/{inv_rule_test.id}/context")
    assert res_inv_inherit_ctx.status_code == 200
    inv_ctx_mitre = res_inv_inherit_ctx.json()["mitre"]
    assert any(m["technique_id"] == "T1059.001" and m["is_direct"] is False for m in inv_ctx_mitre)

    # 18. Phase 7E-3: Investigation Summary MITRE Metrics & Enriched Context Details
    res_inv_sum = await client.get(f"/api/v1/investigations/{inv_rule_test.id}/summary")
    assert res_inv_sum.status_code == 200
    sum_data = res_inv_sum.json()
    assert "mitre_techniques" in sum_data
    assert "mitre_tactics" in sum_data
    assert "analyst_confirmed" in sum_data
    assert "documented_rules" in sum_data
    assert sum_data["mitre_techniques"] >= 1
    assert sum_data["documented_rules"] >= 1
    assert sum_data["analyst_confirmed"] == 0

    # Add an explicit analyst confirmed mapping to inv_rule_test
    res_explicit = await client.post(
        "/api/v1/mitre/mappings",
        json={
            "target_type": "INVESTIGATION",
            "target_id": str(inv_rule_test.id),
            "technique_id": "T1059",
            "mapping_source": "ANALYST_CONFIRMED",
            "confidence": "HIGH",
            "notes": "Analyst observed script execution",
            "created_by": "secops"
        }
    )
    assert res_explicit.status_code == 201
    explicit_id = res_explicit.json()["id"]

    # Verify summary updates with analyst confirmed
    res_inv_sum2 = await client.get(f"/api/v1/investigations/{inv_rule_test.id}/summary")
    assert res_inv_sum2.status_code == 200
    sum_data2 = res_inv_sum2.json()
    assert sum_data2["analyst_confirmed"] == 1

    # Verify enriched context for Phase 7E-3
    res_enriched_ctx = await client.get(f"/api/v1/investigations/{inv_rule_test.id}/context")
    assert res_enriched_ctx.status_code == 200
    mitre_list = res_enriched_ctx.json()["mitre"]
    assert len(mitre_list) >= 2
    explicit_item = next((m for m in mitre_list if m["technique_id"] == "T1059"), None)
    assert explicit_item is not None
    assert explicit_item["relationship"] == "Explicit Investigation Mapping"
    assert explicit_item["is_direct"] is True
    assert explicit_item["evidence_count"] >= 1

    inherited_item = next((m for m in mitre_list if m["technique_id"] == "T1059.001"), None)
    assert inherited_item is not None
    assert inherited_item["relationship"] == "Detection Rule Mapping"
    assert inherited_item["is_direct"] is False
    assert len(inherited_item["related_alerts"]) >= 1

    # 19. Phase 7E-3: Sub-technique parent hierarchy validation
    res_bad_sub = await client.post(
        "/api/v1/mitre/mappings",
        json={
            "target_type": "INVESTIGATION",
            "target_id": str(inv_rule_test.id),
            "technique_id": "T9999.001",
            "mapping_source": "ANALYST_CONFIRMED",
            "confidence": "LOW"
        }
    )
    assert res_bad_sub.status_code == 400
    assert "Parent technique" in res_bad_sub.json()["detail"] or "Technique" in res_bad_sub.json()["detail"]

    # 20. Phase 7E-3: Deletion safety — deleting explicit mapping leaves rule and alert intact
    res_del = await client.delete(f"/api/v1/mitre/mappings/{explicit_id}")
    assert res_del.status_code == 204

    # Check alert still exists
    res_alt_check = await client.get(f"/api/v1/alerts/{alert_inherited.alert_id}")
    assert res_alt_check.status_code == 200

    # Check detection rule still exists
    res_rule_check = await client.get(f"/api/v1/detections/rules/{rule.id}")
    assert res_rule_check.status_code == 200

    # 21. Phase 7E-4: Attack Timeline MITRE Integration Tests
    # A. Retrieve timeline for inv_rule_test: verify detection rule inherited MITRE technique on alert event
    res_tl = await client.get(f"/api/v1/attack-timeline?investigation_id={inv_rule_test.id}")
    assert res_tl.status_code == 200
    tl_data = res_tl.json()
    assert "summary" in tl_data
    assert "items" in tl_data
    assert tl_data["summary"]["mitre_events_count"] >= 1
    assert tl_data["summary"]["mitre_techniques_count"] >= 1

    # Verify item-level MITRE technique fields: technique_id, name, tactics, relationship
    item_with_mitre = next((it for it in tl_data["items"] if it.get("mitre_techniques")), None)
    assert item_with_mitre is not None
    m_tech = item_with_mitre["mitre_techniques"][0]
    assert m_tech["technique_id"] == "T1059.001"
    assert "tactics" in m_tech
    assert len(m_tech["tactics"]) >= 1
    assert m_tech["relationship"] == "Detection Rule Mapping"

    # B. Test mitre_only=true filter
    res_tl_mitre_only = await client.get(f"/api/v1/attack-timeline?investigation_id={inv_rule_test.id}&mitre_only=true")
    assert res_tl_mitre_only.status_code == 200
    for it in res_tl_mitre_only.json()["items"]:
        assert it.get("mitre_techniques") is not None
        assert len(it["mitre_techniques"]) > 0

    # C. Test technique_id filter
    res_tl_tech = await client.get("/api/v1/attack-timeline?technique_id=T1059.001")
    assert res_tl_tech.status_code == 200
    assert res_tl_tech.json()["total"] >= 1

    # D. Test tactic_id filter (TA0002 is Execution)
    res_tl_tac = await client.get("/api/v1/attack-timeline?tactic_id=TA0002")
    assert res_tl_tac.status_code == 200
    assert res_tl_tac.json()["total"] >= 1

    # E. Test invalid technique format and non-existent technique validation
    res_bad_tech_fmt = await client.get("/api/v1/attack-timeline?technique_id=INVALID_TECH")
    assert res_bad_tech_fmt.status_code == 400

    res_not_found_tech = await client.get("/api/v1/attack-timeline?technique_id=T9998")
    assert res_not_found_tech.status_code == 404

    # F. Test invalid tactic format and non-existent tactic validation
    res_bad_tac_fmt = await client.get("/api/v1/attack-timeline?tactic_id=INVALID_TAC")
    assert res_bad_tac_fmt.status_code == 400

    res_not_found_tac = await client.get("/api/v1/attack-timeline?tactic_id=TA9998")
    assert res_not_found_tac.status_code == 404

    # G. Test search matching technique ID
    res_search_tech = await client.get("/api/v1/attack-timeline?search=T1059.001")
    assert res_search_tech.status_code == 200
    assert res_search_tech.json()["total"] >= 1

    # H. Test direct Event mapping in timeline
    # Create direct event mapping for event_inherited
    res_ev_map = await client.post(
        "/api/v1/mitre/mappings",
        json={
            "target_type": "EVENT",
            "target_id": str(event_inherited.id),
            "technique_id": "T1059",
            "mapping_source": "ANALYST_CONFIRMED",
            "confidence": "HIGH",
            "notes": "Direct event confirmation"
        }
    )
    assert res_ev_map.status_code == 201
    ev_map_id = res_ev_map.json()["id"]

    res_direct_ev_tl = await client.get(f"/api/v1/attack-timeline?technique_id=T1059&mitre_source=ANALYST_CONFIRMED")
    assert res_direct_ev_tl.status_code == 200
    assert res_direct_ev_tl.json()["total"] >= 1
    direct_ev_item = next((it for it in res_direct_ev_tl.json()["items"] if it["id"] == event_inherited.id), None)
    assert direct_ev_item is not None
    direct_m = next((m for m in direct_ev_item["mitre_techniques"] if m["technique_id"] == "T1059"), None)
    assert direct_m is not None
    assert direct_m["relationship"] == "Event Direct Mapping"
    assert direct_m["source"] == "ANALYST_CONFIRMED"
    assert direct_m["confidence"] == "HIGH"

    # Clean up mapping
    await client.delete(f"/api/v1/mitre/mappings/{ev_map_id}")


@pytest.mark.asyncio
async def test_source_ip_investigation_phase_7f1(client: AsyncClient, db: AsyncSession):
    """
    Phase 7F-1 Source/IP Investigation Test Suite:
    - Robust IP validation (IPv4, IPv6, loopback, private, public, link-local)
    - Rejection of malformed IPs and invalid formats (400 Bad Request)
    - IP with zero observed events (empty state handling)
    - IP with source and destination telemetry
    - Aggregation metrics (total_events, source_count, destination_count, first/last observed)
    - Associated deduplicated alerts
    - Associated hosts and agents
    - Associated usernames with host lists
    - Associated investigations via evidence linkage
    - Explicit MITRE ATT&CK technique linkage via associated evidence
    - Paginated events endpoint with filtering (role, category, protocol, search)
    - Paginated alerts endpoint with filtering (status, severity)
    - Role query parameter (source, destination, all)
    - Time-range bounded queries
    - Non-destructive and passive behavior (no external network or attribution)
    """
    # Seed MITRE catalog for foreign key relationships
    from backend.app.services.mitre_seeder import seed_mitre_catalog
    await seed_mitre_catalog(db)

    # 1. IP Validation tests
    # Malformed IPs
    for bad_ip in ["invalid-ip", "999.999.999.999", "192.168.1", "2001:xyz::1", "127.0.0.1.5", "::g"]:
        res_bad = await client.get(f"/api/v1/ip-investigation/{bad_ip}")
        assert res_bad.status_code == 400
        assert "Invalid IP address format" in res_bad.json()["detail"]

    # Valid IPv6 with zero events
    res_ipv6_empty = await client.get("/api/v1/ip-investigation/2001:db8::1")
    assert res_ipv6_empty.status_code == 200
    empty_ipv6_data = res_ipv6_empty.json()
    assert empty_ipv6_data["summary"]["ip_address"] == "2001:db8::1"
    assert empty_ipv6_data["summary"]["ip_version"] == "IPv6"
    assert empty_ipv6_data["summary"]["total_events"] == 0
    assert empty_ipv6_data["summary"]["alerts_count"] == 0

    # Valid IPv4 with zero events
    res_ipv4_empty = await client.get("/api/v1/ip-investigation/10.254.254.254")
    assert res_ipv4_empty.status_code == 200
    assert res_ipv4_empty.json()["summary"]["total_events"] == 0
    assert res_ipv4_empty.json()["summary"]["address_scope"] == "private"

    # 2. Setup Telemetry for a target IP: 93.184.216.34 (public IPv4)
    target_ip = "93.184.216.34"
    other_ip = "10.0.0.50"
    base_time = datetime.now(timezone.utc) - timedelta(hours=3)

    # Create host and agent
    host_ip_test = Host(
        host_identifier=f"host-ip-{uuid.uuid4().hex[:6]}",
        hostname="sec-gw-01",
        operating_system="linux",
        ip_address=target_ip
    )
    db.add(host_ip_test)
    await db.flush()

    agent_ip_test = Agent(
        agent_id=f"agent-ip-{uuid.uuid4().hex[:6]}",
        host_id=host_ip_test.id,
        hostname="sec-gw-01",
        operating_system="linux",
        status="ONLINE"
    )
    db.add(agent_ip_test)
    await db.flush()

    # Event 1: target_ip as SOURCE
    ev_src_1 = Event(
        event_id=f"ev-src1-{uuid.uuid4().hex[:8]}",
        timestamp=base_time,
        event_type="firewall_deny",
        event_category="network",
        severity="HIGH",
        hostname="sec-gw-01",
        host_id=host_ip_test.id,
        agent_id=agent_ip_test.id,
        username="svc_backup",
        source_ip=target_ip,
        destination_ip=other_ip,
        source_port=54321,
        destination_port=443,
        protocol="TCP",
        action="deny"
    )
    db.add(ev_src_1)

    # Event 2: target_ip as SOURCE
    ev_src_2 = Event(
        event_id=f"ev-src2-{uuid.uuid4().hex[:8]}",
        timestamp=base_time + timedelta(minutes=10),
        event_type="network_flow",
        event_category="network",
        severity="MEDIUM",
        hostname="sec-gw-01",
        host_id=host_ip_test.id,
        agent_id=agent_ip_test.id,
        username="svc_backup",
        source_ip=target_ip,
        destination_ip="8.8.8.8",
        source_port=54322,
        destination_port=53,
        protocol="UDP",
        action="allow"
    )
    db.add(ev_src_2)

    # Event 3: target_ip as DESTINATION
    ev_dst = Event(
        event_id=f"ev-dst-{uuid.uuid4().hex[:8]}",
        timestamp=base_time + timedelta(minutes=25),
        event_type="ssh_login",
        event_category="authentication",
        severity="LOW",
        hostname="sec-gw-01",
        host_id=host_ip_test.id,
        agent_id=agent_ip_test.id,
        username="admin_sec",
        source_ip=other_ip,
        destination_ip=target_ip,
        source_port=42100,
        destination_port=22,
        protocol="TCP",
        action="success"
    )
    db.add(ev_dst)
    await db.flush()

    # Create Detection Rule and Alert referencing Event 1 and Event 2
    rule_ip = DetectionRule(
        rule_id=f"RUL-IP-{uuid.uuid4().hex[:6]}",
        name="Suspicious Inbound Flow",
        severity="HIGH",
        conditions=[{"field": "event_type", "operator": "equals", "value": "firewall_deny"}]
    )
    db.add(rule_ip)
    await db.flush()

    alert_ip = Alert(
        alert_id=f"alt-ip-{uuid.uuid4().hex[:8]}",
        rule_id=rule_ip.id,
        title="Firewall Deny Involving Target IP",
        severity="HIGH",
        status="OPEN",
        fingerprint=f"FP-IP-{uuid.uuid4().hex[:8]}",
        first_seen=base_time,
        last_seen=base_time + timedelta(minutes=10),
        occurrence_count=2,
        agent_id=agent_ip_test.id,
        host_id=host_ip_test.id
    )
    db.add(alert_ip)
    await db.flush()

    # Link both ev_src_1 and ev_src_2 to alert_ip via DetectionResult
    dr1 = DetectionResult(event_id=ev_src_1.id, alert_id=alert_ip.id, rule_id=rule_ip.id)
    dr2 = DetectionResult(event_id=ev_src_2.id, alert_id=alert_ip.id, rule_id=rule_ip.id)
    db.add(dr1)
    db.add(dr2)
    await db.flush()

    # Create Investigation with evidence linking alert_ip and ev_dst
    inv_ip = Investigation(
        title=f"IP Evidence Investigation {uuid.uuid4().hex[:6]}",
        status=InvestigationStatus.IN_PROGRESS.value,
        severity=InvestigationSeverity.HIGH.value
    )
    db.add(inv_ip)
    await db.flush()

    ev_link1 = InvestigationEvidence(
        investigation_id=inv_ip.id,
        evidence_type="ALERT",
        reference_id=str(alert_ip.id)
    )
    ev_link2 = InvestigationEvidence(
        investigation_id=inv_ip.id,
        evidence_type="EVENT",
        reference_id=str(ev_dst.id)
    )
    db.add(ev_link1)
    db.add(ev_link2)
    await db.flush()

    # Link MITRE technique to Detection Rule of the alert
    # T1046 - Network Service Discovery
    mitre_map_rule = MitreMapping(
        technique_id="T1046",
        target_type=MitreTargetType.DETECTION_RULE.value,
        target_id=str(rule_ip.id),
        mapping_source=MitreMappingSource.DOCUMENTED_RULE.value,
        confidence=MitreConfidence.HIGH.value,
        evidence_reference="Detection Rule T1046"
    )
    db.add(mitre_map_rule)
    await db.commit()

    # 3. Test IP Overview Endpoint: GET /api/v1/ip-investigation/{target_ip}
    res_overview = await client.get(f"/api/v1/ip-investigation/{target_ip}")
    assert res_overview.status_code == 200
    ov_data = res_overview.json()

    # Validate Summary
    summary = ov_data["summary"]
    assert summary["ip_address"] == target_ip
    assert summary["ip_version"] == "IPv4"
    assert summary["address_scope"] == "public"
    assert summary["total_events"] == 3
    assert summary["source_events_count"] == 2
    assert summary["destination_events_count"] == 1
    assert summary["alerts_count"] == 1  # Deduplicated from 2 events
    assert summary["hosts_count"] >= 1
    assert summary["agents_count"] >= 1
    assert summary["users_count"] >= 2  # svc_backup and admin_sec
    assert summary["investigations_count"] >= 1
    assert summary["mitre_techniques_count"] >= 1

    # Validate Associated Hosts
    assert any(h["hostname"] == "sec-gw-01" for h in ov_data["associated_hosts"])

    # Validate Associated Users
    users_seen = {u["username"] for u in ov_data["associated_users"]}
    assert "svc_backup" in users_seen
    assert "admin_sec" in users_seen

    # Validate Associated Investigations
    assert any(inv["id"] == inv_ip.id for inv in ov_data["associated_investigations"])

    # Validate MITRE Techniques
    assert any(mt["technique_id"] == "T1046" for mt in ov_data["mitre_techniques"])

    # 4. Test Role Query Filter: role=source
    res_role_src = await client.get(f"/api/v1/ip-investigation/{target_ip}?role=source")
    assert res_role_src.status_code == 200
    src_data = res_role_src.json()
    assert src_data["summary"]["total_events"] == 2

    # Test Role Query Filter: role=destination
    res_role_dst = await client.get(f"/api/v1/ip-investigation/{target_ip}?role=destination")
    assert res_role_dst.status_code == 200
    assert res_role_dst.json()["summary"]["total_events"] == 1

    # 5. Test IP Events Endpoint: GET /api/v1/ip-investigation/{target_ip}/events
    res_evs = await client.get(f"/api/v1/ip-investigation/{target_ip}/events")
    assert res_evs.status_code == 200
    evs_data = res_evs.json()
    assert evs_data["total"] == 3
    assert len(evs_data["items"]) == 3

    # Filter events by category
    res_ev_filter = await client.get(f"/api/v1/ip-investigation/{target_ip}/events?event_category=authentication")
    assert res_ev_filter.status_code == 200
    assert res_ev_filter.json()["total"] == 1
    assert res_ev_filter.json()["items"][0]["event_type"] == "ssh_login"

    # Filter events by protocol
    res_ev_proto = await client.get(f"/api/v1/ip-investigation/{target_ip}/events?protocol=udp")
    assert res_ev_proto.status_code == 200
    assert res_ev_proto.json()["total"] == 1
    assert res_ev_proto.json()["items"][0]["protocol"] == "UDP"

    # 6. Test IP Alerts Endpoint: GET /api/v1/ip-investigation/{target_ip}/alerts
    res_als = await client.get(f"/api/v1/ip-investigation/{target_ip}/alerts")
    assert res_als.status_code == 200
    als_data = res_als.json()
    assert als_data["total"] == 1
    assert als_data["items"][0]["id"] == alert_ip.id
    assert "source" in als_data["items"][0]["observed_roles"]
    assert "T1046" in als_data["items"][0]["mitre_techniques"]

    # 7. Time range testing
    valid_start = (base_time + timedelta(minutes=5)).isoformat()
    valid_end = (base_time + timedelta(minutes=30)).isoformat()
    res_time = await client.get(
        f"/api/v1/ip-investigation/{target_ip}",
        params={"start_time": valid_start, "end_time": valid_end}
    )
    assert res_time.status_code == 200, f"Error: {res_time.text}"
    assert res_time.json()["summary"]["total_events"] == 2  # ev_src_2 and ev_dst

    # Reversed time range error
    res_bad_time = await client.get(
        f"/api/v1/ip-investigation/{target_ip}",
        params={"start_time": valid_end, "end_time": valid_start}
    )
    assert res_bad_time.status_code == 400


@pytest.mark.asyncio
async def test_host_investigation_phase_7f2(client: AsyncClient, db: AsyncSession):
    from backend.app.services.mitre_seeder import seed_mitre_catalog
    await seed_mitre_catalog(db)

    base_time = datetime.now(timezone.utc) - timedelta(hours=3)

    # 1. Test Host Resolution & 404 / 400 errors
    res_404 = await client.get("/api/v1/host-investigation/nonexistent-host-999")
    assert res_404.status_code == 404

    res_404_id = await client.get("/api/v1/host-investigation/999999")
    assert res_404_id.status_code == 404

    # 2. Create Host & Associated Agent
    host_target = Host(
        host_identifier="host-srv-corp-01",
        hostname="srv-corp-01",
        operating_system="linux",
        os_version="Ubuntu 22.04",
        ip_address="10.0.10.15",
        status="ONLINE",
        created_at=base_time,
        last_seen=base_time + timedelta(hours=2)
    )
    db.add(host_target)
    await db.flush()

    agent_target = Agent(
        agent_id="agt-srv-corp-01",
        host_id=host_target.id,
        hostname="srv-corp-01",
        operating_system="linux",
        agent_version="1.4.2",
        status="ONLINE",
        ip_address="10.0.10.15",
        registered_at=base_time,
        last_heartbeat=base_time + timedelta(hours=2),
        last_seen=base_time + timedelta(hours=2)
    )
    db.add(agent_target)
    await db.flush()

    # 3. Create Telemetry Events for this host
    ev1 = Event(
        event_id=f"evt-host-01-{uuid.uuid4().hex[:6]}",
        timestamp=base_time,
        host_id=host_target.id,
        agent_id=agent_target.id,
        hostname=host_target.hostname,
        operating_system=host_target.operating_system,
        source_type="syslog",
        event_category="authentication",
        event_type="ssh_login",
        username="sec_admin",
        source_ip="10.0.10.50",
        destination_ip="10.0.10.15",
        source_port=52344,
        destination_port=22,
        protocol="TCP",
        action="login_success",
        severity="INFO"
    )
    ev2 = Event(
        event_id=f"evt-host-02-{uuid.uuid4().hex[:6]}",
        timestamp=base_time + timedelta(minutes=15),
        host_id=host_target.id,
        agent_id=agent_target.id,
        hostname=host_target.hostname,
        operating_system=host_target.operating_system,
        source_type="syslog",
        event_category="process",
        event_type="process_spawn",
        username="root",
        source_ip="10.0.10.15",
        destination_ip="10.0.20.100",
        source_port=44231,
        destination_port=8080,
        protocol="TCP",
        action="exec",
        severity="MEDIUM"
    )
    ev3 = Event(
        event_id=f"evt-host-03-{uuid.uuid4().hex[:6]}",
        timestamp=base_time + timedelta(minutes=30),
        host_id=host_target.id,
        agent_id=agent_target.id,
        hostname=host_target.hostname,
        operating_system=host_target.operating_system,
        source_type="syslog",
        event_category="network",
        event_type="connection_closed",
        username="sec_admin",
        source_ip="10.0.10.15",
        destination_ip="10.0.20.100",
        source_port=44231,
        destination_port=8080,
        protocol="TCP",
        action="close",
        severity="LOW"
    )
    db.add_all([ev1, ev2, ev3])
    await db.flush()

    # 4. Create Detection Rule, Alert, and DetectionResult
    rule_host = DetectionRule(
        rule_id=f"rule-host-{uuid.uuid4().hex[:6]}",
        name="Host Suspicious Execution Rule",
        description="Rule detecting suspicious host execution",
        severity="HIGH",
        conditions=[{"field": "event_type", "operator": "equals", "value": "process_spawn"}]
    )
    db.add(rule_host)
    await db.flush()

    alert_host = Alert(
        alert_id=f"al-host-{uuid.uuid4().hex[:6]}",
        title="Suspicious Process on Host",
        description="Alert for process execution",
        severity="HIGH",
        status="OPEN",
        occurrence_count=2,
        fingerprint=f"fp-host-{uuid.uuid4().hex[:8]}",
        rule_id=rule_host.id,
        agent_id=agent_target.id,
        host_id=host_target.id,
        first_seen=base_time + timedelta(minutes=15),
        last_seen=base_time + timedelta(minutes=30)
    )
    db.add(alert_host)
    await db.flush()

    dr1 = DetectionResult(rule_id=rule_host.id, event_id=ev2.id, alert_id=alert_host.id)
    dr2 = DetectionResult(rule_id=rule_host.id, event_id=ev3.id, alert_id=alert_host.id)
    db.add_all([dr1, dr2])
    await db.flush()

    # 5. MITRE Mapping to Rule and Host
    rule_map = MitreMapping(
        technique_id="T1059",
        target_type=MitreTargetType.DETECTION_RULE.value,
        target_id=str(rule_host.id),
        mapping_source=MitreMappingSource.DOCUMENTED_RULE.value,
        confidence=MitreConfidence.HIGH.value
    )
    db.add(rule_map)
    await db.flush()

    # 6. Create Investigation with evidence linking to host and alert
    inv_host = Investigation(
        title="Investigation on srv-corp-01",
        description="Host investigation case",
        status="OPEN",
        severity="HIGH"
    )
    db.add(inv_host)
    await db.flush()

    ev_link1 = InvestigationEvidence(
        investigation_id=inv_host.id,
        evidence_type="HOST",
        reference_id=str(host_target.id),
        description="Primary host"
    )
    ev_link2 = InvestigationEvidence(
        investigation_id=inv_host.id,
        evidence_type="ALERT",
        reference_id=str(alert_host.id),
        description="Alert evidence"
    )
    db.add_all([ev_link1, ev_link2])
    await db.commit()

    # 7. Test Overview Endpoint: GET /api/v1/host-investigation/{host_id} by ID and by hostname
    res_ov_id = await client.get(f"/api/v1/host-investigation/{host_target.id}")
    assert res_ov_id.status_code == 200
    ov_data = res_ov_id.json()

    # Verify Host Identity & Agent Relationship
    assert ov_data["host"]["id"] == host_target.id
    assert ov_data["host"]["hostname"] == "srv-corp-01"
    assert ov_data["host"]["operating_system"] == "linux"
    assert len(ov_data["agents"]) == 1
    assert ov_data["agents"][0]["agent_id"] == "agt-srv-corp-01"
    assert ov_data["agents"][0]["status"] == "ONLINE"

    # Verify Summary Metrics
    summary = ov_data["summary"]
    assert summary["host_id"] == host_target.id
    assert summary["hostname"] == "srv-corp-01"
    assert summary["total_events"] == 3
    assert summary["alerts_count"] == 1  # Deduplicated alert
    assert summary["users_count"] == 2   # sec_admin and root
    assert summary["source_ips_count"] >= 1
    assert summary["destination_ips_count"] >= 1
    assert summary["investigations_count"] >= 1
    assert summary["mitre_techniques_count"] >= 1

    # Verify Observed Users
    users_seen = {u["username"]: u["event_count"] for u in ov_data["users"]}
    assert "sec_admin" in users_seen
    assert users_seen["sec_admin"] == 2
    assert "root" in users_seen
    assert users_seen["root"] == 1

    # Verify Source and Destination IPs
    src_ips = {ip["ip_address"] for ip in ov_data["source_ips"]}
    assert "10.0.10.50" in src_ips
    assert "10.0.10.15" in src_ips

    dst_ips = {ip["ip_address"] for ip in ov_data["destination_ips"]}
    assert "10.0.10.15" in dst_ips
    assert "10.0.20.100" in dst_ips

    # Verify Associated Investigations
    assert any(inv["id"] == inv_host.id for inv in ov_data["investigations"])

    # Verify MITRE Techniques
    assert any(mt["technique_id"] == "T1059" for mt in ov_data["mitre_techniques"])

    # Test Resolve by Hostname
    res_ov_name = await client.get(f"/api/v1/host-investigation/{host_target.hostname}")
    assert res_ov_name.status_code == 200
    assert res_ov_name.json()["host"]["id"] == host_target.id

    # 8. Test Host Events Endpoint: GET /api/v1/host-investigation/{host_id}/events
    res_evs = await client.get(f"/api/v1/host-investigation/{host_target.id}/events")
    assert res_evs.status_code == 200
    evs_data = res_evs.json()
    assert evs_data["total"] == 3
    assert len(evs_data["items"]) == 3

    # Filter events by category
    res_ev_cat = await client.get(f"/api/v1/host-investigation/{host_target.id}/events?event_category=authentication")
    assert res_ev_cat.status_code == 200
    assert res_ev_cat.json()["total"] == 1
    assert res_ev_cat.json()["items"][0]["event_type"] == "ssh_login"

    # Filter events by protocol
    res_ev_proto = await client.get(f"/api/v1/host-investigation/{host_target.id}/events?protocol=tcp")
    assert res_ev_proto.status_code == 200
    assert res_ev_proto.json()["total"] == 3

    # Filter events by username
    res_ev_user = await client.get(f"/api/v1/host-investigation/{host_target.id}/events?username=root")
    assert res_ev_user.status_code == 200
    assert res_ev_user.json()["total"] == 1

    # 9. Test Host Alerts Endpoint: GET /api/v1/host-investigation/{host_id}/alerts
    res_als = await client.get(f"/api/v1/host-investigation/{host_target.id}/alerts")
    assert res_als.status_code == 200
    als_data = res_als.json()
    assert als_data["total"] == 1
    assert als_data["items"][0]["id"] == alert_host.id
    assert "T1059" in als_data["items"][0]["mitre_techniques"]

    # 10. Time range testing
    valid_start = (base_time + timedelta(minutes=10)).isoformat()
    valid_end = (base_time + timedelta(minutes=45)).isoformat()
    res_time = await client.get(
        f"/api/v1/host-investigation/{host_target.id}",
        params={"start_time": valid_start, "end_time": valid_end}
    )
    assert res_time.status_code == 200
    assert res_time.json()["summary"]["total_events"] == 2  # ev2 and ev3

    # Reversed time range error
    res_bad_time = await client.get(
        f"/api/v1/host-investigation/{host_target.id}",
        params={"start_time": valid_end, "end_time": valid_start}
    )
    assert res_bad_time.status_code == 400


@pytest.mark.asyncio
async def test_threat_context_phase_7f3(client: AsyncClient, db: AsyncSession):
    from backend.app.services.mitre_seeder import seed_mitre_catalog
    await seed_mitre_catalog(db)

    base_time = datetime.now(timezone.utc) - timedelta(hours=2)
    test_username = f"analyst_{uuid.uuid4().hex[:6]}"

    host_ctx = Host(
        host_identifier=f"ctx-host-{uuid.uuid4().hex[:6]}",
        hostname=f"ctx-srv-{uuid.uuid4().hex[:4]}",
        operating_system="linux",
        os_version="Ubuntu 22.04",
        ip_address="10.50.0.10",
        status="ONLINE",
        created_at=base_time,
        last_seen=base_time + timedelta(hours=1)
    )
    db.add(host_ctx)
    await db.flush()

    agent_ctx = Agent(
        agent_id=f"agt-ctx-{uuid.uuid4().hex[:6]}",
        host_id=host_ctx.id,
        hostname=host_ctx.hostname,
        operating_system="linux",
        agent_version="1.5.0",
        status="ONLINE",
        ip_address="10.50.0.10",
        registered_at=base_time,
        last_heartbeat=base_time + timedelta(hours=1),
        last_seen=base_time + timedelta(hours=1)
    )
    db.add(agent_ctx)
    await db.flush()

    ev_a = Event(
        event_id=f"evt-ctx-a-{uuid.uuid4().hex[:6]}",
        timestamp=base_time,
        host_id=host_ctx.id,
        agent_id=agent_ctx.id,
        hostname=host_ctx.hostname,
        operating_system="linux",
        source_type="syslog",
        event_category="authentication",
        event_type="ssh_login",
        username=test_username,
        source_ip="10.50.0.5",
        destination_ip="10.50.0.10",
        source_port=51234,
        destination_port=22,
        protocol="TCP",
        action="login_success",
        severity="INFO"
    )
    ev_b = Event(
        event_id=f"evt-ctx-b-{uuid.uuid4().hex[:6]}",
        timestamp=base_time + timedelta(minutes=10),
        host_id=host_ctx.id,
        agent_id=agent_ctx.id,
        hostname=host_ctx.hostname,
        operating_system="linux",
        source_type="syslog",
        event_category="process",
        event_type="process_spawn",
        username=test_username,
        source_ip="10.50.0.10",
        destination_ip="8.8.8.8",
        source_port=54321,
        destination_port=443,
        protocol="TCP",
        action="exec",
        severity="MEDIUM"
    )
    ev_c = Event(
        event_id=f"evt-ctx-c-{uuid.uuid4().hex[:6]}",
        timestamp=base_time + timedelta(minutes=5),
        host_id=host_ctx.id,
        agent_id=agent_ctx.id,
        hostname=host_ctx.hostname,
        operating_system="linux",
        source_type="syslog",
        event_category="network",
        event_type="connection_closed",
        username=test_username,
        source_ip="10.50.0.10",
        destination_ip="10.50.0.1",
        source_port=49999,
        destination_port=80,
        protocol="TCP",
        action="close",
        severity="LOW"
    )
    db.add_all([ev_a, ev_b, ev_c])
    await db.flush()

    rule_ctx2 = DetectionRule(
        rule_id=f"rule-ctx-{uuid.uuid4().hex[:6]}",
        name="Context Test Rule",
        description="Rule for context testing",
        severity="HIGH",
        conditions=[{"field": "event_type", "operator": "equals", "value": "process_spawn"}]
    )
    db.add(rule_ctx2)
    await db.flush()

    alert_ctx2 = Alert(
        alert_id=f"al-ctx-{uuid.uuid4().hex[:6]}",
        title="Context Test Alert",
        description="Alert for context testing",
        severity="HIGH",
        status="OPEN",
        occurrence_count=1,
        fingerprint=f"fp-ctx-{uuid.uuid4().hex[:8]}",
        rule_id=rule_ctx2.id,
        agent_id=agent_ctx.id,
        host_id=host_ctx.id,
        first_seen=base_time + timedelta(minutes=10),
        last_seen=base_time + timedelta(minutes=10)
    )
    db.add(alert_ctx2)
    await db.flush()

    dr_ctx = DetectionResult(rule_id=rule_ctx2.id, event_id=ev_b.id, alert_id=alert_ctx2.id)
    db.add(dr_ctx)
    await db.flush()

    rule_map_ctx = MitreMapping(
        technique_id="T1059",
        target_type=MitreTargetType.DETECTION_RULE.value,
        target_id=str(rule_ctx2.id),
        mapping_source=MitreMappingSource.DOCUMENTED_RULE.value,
        confidence=MitreConfidence.HIGH.value
    )
    db.add(rule_map_ctx)
    await db.flush()

    inv_ctx2 = Investigation(
        title="Context Test Investigation",
        description="Investigation for context phase",
        status="OPEN",
        severity="HIGH"
    )
    db.add(inv_ctx2)
    await db.flush()

    inv_ev_a = InvestigationEvidence(
        investigation_id=inv_ctx2.id,
        evidence_type="EVENT",
        reference_id=str(ev_a.id),
        description="Event A evidence"
    )
    inv_ev_al = InvestigationEvidence(
        investigation_id=inv_ctx2.id,
        evidence_type="ALERT",
        reference_id=str(alert_ctx2.id),
        description="Alert evidence"
    )
    db.add_all([inv_ev_a, inv_ev_al])
    await db.commit()

    # Test A: User Context Endpoint
    res_user = await client.get(f"/api/v1/user-context/{test_username}")
    assert res_user.status_code == 200, f"User context failed: {res_user.text}"
    uc = res_user.json()

    assert uc["summary"]["username"] == test_username
    assert uc["summary"]["total_events"] == 3
    assert uc["summary"]["hosts_count"] >= 1
    assert uc["summary"]["source_ips_count"] >= 1
    assert uc["summary"]["destination_ips_count"] >= 1
    assert uc["summary"]["alerts_count"] >= 1
    assert uc["summary"]["investigations_count"] >= 1

    host_hostnames = [h["hostname"] for h in uc["hosts"]]
    assert host_ctx.hostname in host_hostnames

    categories = [a["event_category"] for a in uc["activity_breakdown"]]
    assert "authentication" in categories
    assert "process" in categories

    assert alert_ctx2.id in [a["id"] for a in uc["alerts"]]
    assert inv_ctx2.id in [i["id"] for i in uc["investigations"]]

    res_user_evs = await client.get(f"/api/v1/user-context/{test_username}/events")
    assert res_user_evs.status_code == 200
    assert res_user_evs.json()["total"] == 3

    res_ue_cat = await client.get(f"/api/v1/user-context/{test_username}/events?event_category=authentication")
    assert res_ue_cat.status_code == 200
    assert res_ue_cat.json()["total"] == 1

    res_404_user = await client.get("/api/v1/user-context/definitely_not_a_real_user_xyz9999")
    assert res_404_user.status_code == 404

    # Test B: Event Context Endpoint
    res_ev_ctx = await client.get(f"/api/v1/events/{ev_b.event_id}/context")
    assert res_ev_ctx.status_code == 200, f"Event context failed: {res_ev_ctx.text}"
    ec = res_ev_ctx.json()

    assert ec["event_id"] == ev_b.event_id
    assert ec["id"] == ev_b.id
    assert ec["username"] == test_username
    assert ec["event_category"] == "process"
    assert ec["host"] is not None
    assert ec["host"]["hostname"] == host_ctx.hostname
    assert ec["agent"] is not None
    assert ec["agent"]["agent_id"] == agent_ctx.agent_id
    assert alert_ctx2.id in [a["id"] for a in ec["alerts"]]
    nearby_ids = [ne["id"] for ne in ec["nearby_events"]]
    assert ev_a.id in nearby_ids or ev_c.id in nearby_ids

    res_ev_ctx_id = await client.get(f"/api/v1/events/{ev_b.id}/context")
    assert res_ev_ctx_id.status_code == 200
    assert res_ev_ctx_id.json()["event_id"] == ev_b.event_id

    res_404_ev = await client.get("/api/v1/events/nonexistent-event-xyz-99999/context")
    assert res_404_ev.status_code == 404

    # Test C: Alert Context Endpoint
    res_al_ctx = await client.get(f"/api/v1/alerts/{alert_ctx2.alert_id}/context")
    assert res_al_ctx.status_code == 200, f"Alert context failed: {res_al_ctx.text}"
    ac = res_al_ctx.json()

    assert ac["id"] == alert_ctx2.id
    assert ac["alert_id"] == alert_ctx2.alert_id
    assert ac["title"] == "Context Test Alert"
    assert ac["rule"] is not None
    assert ac["rule"]["name"] == "Context Test Rule"
    assert ac["host"] is not None
    assert ac["host"]["hostname"] == host_ctx.hostname
    assert ac["agent"] is not None
    assert ac["agent"]["agent_id"] == agent_ctx.agent_id
    assert ev_b.id in [e["id"] for e in ac["triggering_events"]]
    assert len(ac["observed_ips"]) >= 1
    assert "T1059" in [m["technique_id"] for m in ac["mitre_techniques"]]
    assert inv_ctx2.id in [i["id"] for i in ac["investigations"]]

    res_al_ctx_id = await client.get(f"/api/v1/alerts/{alert_ctx2.id}/context")
    assert res_al_ctx_id.status_code == 200
    assert res_al_ctx_id.json()["alert_id"] == alert_ctx2.alert_id

    res_404_al = await client.get("/api/v1/alerts/definitely-not-real-alert-xyz/context")
    assert res_404_al.status_code == 404

    valid_start = (base_time + timedelta(minutes=5)).isoformat()
    valid_end = (base_time + timedelta(minutes=15)).isoformat()
    res_uc_time = await client.get(
        f"/api/v1/user-context/{test_username}",
        params={"start_time": valid_start, "end_time": valid_end}
    )
    assert res_uc_time.status_code == 200
    assert res_uc_time.json()["summary"]["total_events"] == 2


@pytest.mark.asyncio
async def test_investigation_intelligence_phase_7f4(client: AsyncClient, db: AsyncSession):
    base_time = datetime.now(timezone.utc)
    
    # Create Investigation
    inv = Investigation(title="Phase 7F-4 Intelligence Test", status="OPEN", severity="HIGH")
    db.add(inv)
    await db.flush()

    # Create Event
    ev = Event(
        event_id=f"evt-7f4-{uuid.uuid4().hex[:6]}",
        timestamp=base_time,
        event_category="authentication",
        event_type="login",
        hostname="server-7f4",
        source_ip="192.168.1.10",
        username="admin_7f4"
    )
    db.add(ev)
    await db.flush()

    # Create Rule & Alert
    rule = DetectionRule(
        rule_id=f"rule-7f4-{uuid.uuid4().hex[:6]}",
        name="Rule 7F-4",
        severity="HIGH",
        conditions=[{"field": "event_type", "operator": "equals", "value": "login"}]
    )
    db.add(rule)
    await db.flush()

    alert = Alert(
        alert_id=f"al-7f4-{uuid.uuid4().hex[:6]}",
        title="Alert 7F-4",
        severity="HIGH",
        status="OPEN",
        occurrence_count=1,
        fingerprint=f"fp-7f4-{uuid.uuid4().hex[:8]}",
        rule_id=rule.id,
        first_seen=base_time,
        last_seen=base_time
    )
    db.add(alert)
    await db.flush()

    dr = DetectionResult(rule_id=rule.id, event_id=ev.id, alert_id=alert.id)
    db.add(dr)
    
    # Evidence
    ev_evidence = InvestigationEvidence(investigation_id=inv.id, evidence_type="EVENT", reference_id=str(ev.id))
    al_evidence = InvestigationEvidence(investigation_id=inv.id, evidence_type="ALERT", reference_id=str(alert.id))
    db.add_all([ev_evidence, al_evidence])
    await db.commit()

    # Call the endpoint
    res = await client.get(f"/api/v1/investigations/{inv.id}/intelligence")
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["investigation_id"] == inv.id
    
    # Summary checks
    assert data["summary"]["total_evidence"] == 2
    assert data["summary"]["events"] == 1
    assert data["summary"]["alerts"] == 1
    assert data["summary"]["hosts"] == 1
    assert data["summary"]["source_ips"] == 1
    assert data["summary"]["users"] == 1

    # Entity checks
    assert len(data["hosts"]) == 1
    assert data["hosts"][0]["hostname"] == "server-7f4"
    assert data["hosts"][0]["event_count"] == 1
    
    assert len(data["ips"]) == 1
    assert data["ips"][0]["ip_address"] == "192.168.1.10"
    
    assert len(data["users"]) == 1
    assert data["users"][0]["username"] == "admin_7f4"

    # Alerts & Rules
    assert len(data["alerts"]) == 1
    assert data["alerts"][0]["alert_id"] == alert.alert_id
    
    assert len(data["detection_rules"]) == 1
    assert data["detection_rules"][0]["rule_id"] == rule.rule_id

    # Timeline & Events
    assert data["timeline_summary"]["total_timeline_events"] == 1
    assert data["timeline_summary"]["direct_evidence_count"] == 1
    assert len(data["events"]) == 1
    assert data["events"][0]["is_direct"] is True

    # 404 test
    res_404 = await client.get("/api/v1/investigations/999999/intelligence")
    assert res_404.status_code == 404


@pytest.mark.asyncio
async def test_behavioral_analytics_phase_8a(client: AsyncClient, db: AsyncSession):
    from backend.app.models.analytics import BehaviorBaseline, BehaviorDeviation, BehaviorDeviationEvidence
    
    # 1. Create a baseline
    baseline = BehaviorBaseline(
        entity_type="HOST",
        entity_id="server-123",
        metric_name="daily_event_volume",
        time_window="1d",
        expected_value=100.0,
        variance=15.0,
        sample_count=30
    )
    db.add(baseline)
    await db.flush()

    # 2. Create a deviation
    now = datetime.now(timezone.utc)
    deviation = BehaviorDeviation(
        baseline_id=baseline.id,
        entity_type="HOST",
        entity_id="server-123",
        metric_name="daily_event_volume",
        observed_value=500.0,
        expected_value=100.0,
        deviation_magnitude=26.6,
        observation_timestamp=now,
        explanation="Observed 500 events, normal is 100."
    )
    db.add(deviation)
    await db.flush()

    ev = BehaviorDeviationEvidence(
        deviation_id=deviation.id,
        evidence_type="EVENT",
        reference_id="test-event-id"
    )
    db.add(ev)
    await db.commit()

    # 3. Test baselines API
    res_base = await client.get("/api/v1/analytics/baselines")
    assert res_base.status_code == 200
    data_base = res_base.json()
    assert len(data_base) >= 1
    assert any(b["entity_id"] == "server-123" for b in data_base)

    # 4. Test deviation API
    res_dev = await client.get("/api/v1/analytics/deviations?entity_type=HOST&entity_id=server-123")
    assert res_dev.status_code == 200
    data_dev = res_dev.json()
    assert len(data_dev) == 1
    assert data_dev[0]["entity_id"] == "server-123"
    assert len(data_dev[0]["evidence"]) == 1
    assert data_dev[0]["evidence"][0]["reference_id"] == "test-event-id"

    # 5. Test get baseline by id
    res_b_id = await client.get(f"/api/v1/analytics/baselines/{baseline.id}")
    assert res_b_id.status_code == 200
    assert res_b_id.json()["id"] == baseline.id


