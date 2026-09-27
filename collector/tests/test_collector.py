import pytest
from httpx import AsyncClient
from datetime import datetime, timezone
import uuid

@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_unauthenticated_registration(client: AsyncClient):
    payload = {
        "agent_id": str(uuid.uuid4()),
        "hostname": "test-host",
        "operating_system": "linux",
        "agent_version": "1.0"
    }
    response = await client.post("/api/v1/agent/register", json=payload)
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_valid_registration(client: AsyncClient):
    agent_id = str(uuid.uuid4())
    payload = {
        "agent_id": agent_id,
        "hostname": "test-host",
        "operating_system": "linux",
        "agent_version": "1.0",
        "ip_address": "127.0.0.1"
    }
    headers = {"X-Agent-Auth": "changeme_secret"}
    response = await client.post("/api/v1/agent/register", json=payload, headers=headers)

    assert response.status_code == 201
    assert response.json()["status"] == "ok"
    assert response.json()["agent_id"] == agent_id

@pytest.mark.asyncio
async def test_idempotent_registration(client: AsyncClient):
    agent_id = str(uuid.uuid4())
    payload = {
        "agent_id": agent_id,
        "hostname": "test-host",
        "operating_system": "linux",
        "agent_version": "1.0"
    }
    headers = {"X-Agent-Auth": "changeme_secret"}

    # First time
    resp1 = await client.post("/api/v1/agent/register", json=payload, headers=headers)
    assert resp1.status_code == 201

    # Second time
    payload["agent_version"] = "1.1"
    resp2 = await client.post("/api/v1/agent/register", json=payload, headers=headers)
    assert resp2.status_code == 201
    assert resp2.json()["message"] == "Agent updated"

@pytest.mark.asyncio
async def test_heartbeat_unknown_agent(client: AsyncClient):
    payload = {
        "agent_id": "unknown",
        "hostname": "host",
        "agent_version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "connection_status": "ONLINE"
    }
    headers = {"X-Agent-Auth": "changeme_secret"}
    response = await client.post("/api/v1/agent/heartbeat", json=payload, headers=headers)
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_valid_heartbeat_and_event(client: AsyncClient):
    # 1. Register agent
    agent_id = str(uuid.uuid4())
    payload = {
        "agent_id": agent_id,
        "hostname": "test-host-2",
        "operating_system": "windows",
        "agent_version": "1.0"
    }
    headers = {"X-Agent-Auth": "changeme_secret"}
    await client.post("/api/v1/agent/register", json=payload, headers=headers)

    # 2. Heartbeat
    hb_payload = {
        "agent_id": agent_id,
        "hostname": "test-host-2",
        "agent_version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "connection_status": "ONLINE"
    }
    hb_resp = await client.post("/api/v1/agent/heartbeat", json=hb_payload, headers=headers)
    assert hb_resp.status_code == 200

    # 3. Event submission
    event_payload = {
        "event_id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "hostname": "test-host-2",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "login",
        "source": "windows_event",
        "payload": '{"user":"admin"}'
    }
    ev_resp = await client.post("/api/v1/agent/events", json=event_payload, headers=headers)
    assert ev_resp.status_code == 202
    assert ev_resp.json()["status"] == "ok"
