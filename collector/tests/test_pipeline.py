import pytest
from httpx import AsyncClient
import uuid
import json
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.models.raw_log import RawLog
from backend.app.models.event import Event
from backend.app.models.agent import Agent
from collector.app.config import settings

import pytest_asyncio

# Shared mock data
AUTH_HEADERS = {"X-Agent-Auth": settings.AGENT_SHARED_SECRET}

@pytest_asyncio.fixture
async def setup_agent(client: AsyncClient, db: AsyncSession):
    """Helper to register an agent for testing."""
    agent_id = str(uuid.uuid4())
    payload = {
        "agent_id": agent_id,
        "hostname": "pipeline-test-host",
        "operating_system": "windows",
        "agent_version": "1.0",
        "metadata": {"custom": "tag"}
    }
    await client.post("/api/v1/agent/register", json=payload, headers=AUTH_HEADERS)

    # Get the agent from db
    stmt = select(Agent).where(Agent.agent_id == agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one()
    return agent

@pytest.mark.asyncio
async def test_valid_event_pipeline(client: AsyncClient, db: AsyncSession, setup_agent: Agent):
    """Test full pipeline: RawLog + Event creation for valid payload"""
    event_id = str(uuid.uuid4())
    windows_payload = json.dumps({
        "System": {
            "EventID": 3,
            "Level": 2
        },
        "EventData": {
            "SourceIp": "192.168.1.10",
            "DestinationIp": "10.0.0.1",
            "SourcePort": "12345",
            "DestinationPort": "443",
            "Protocol": "tcp"
        }
    })

    event_req = {
        "event_id": event_id,
        "agent_id": setup_agent.agent_id,
        "hostname": setup_agent.hostname,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "network",
        "source": "sysmon",
        "payload": windows_payload,
        "metadata": {"test": "metadata"}
    }

    res = await client.post("/api/v1/agent/events", json=event_req, headers=AUTH_HEADERS)
    assert res.status_code == 202

    # Check RawLog
    stmt = select(RawLog).where(RawLog.event_identifier == event_id)
    result = await db.execute(stmt)
    raw = result.scalar_one_or_none()
    assert raw is not None
    assert raw.raw_payload == windows_payload
    assert raw.ingestion_status == "PROCESSED"
    assert "collector_received_at" in raw.metadata_

    # Check Normalized Event
    stmt = select(Event).where(Event.event_id == event_id)
    result = await db.execute(stmt)
    evt = result.scalar_one_or_none()
    assert evt is not None
    assert evt.raw_log_id == raw.id
    assert evt.event_category == "windows"
    assert evt.event_type == "3"
    assert evt.source_ip == "192.168.1.10"
    assert evt.destination_port == 443
    assert evt.severity == "HIGH"

@pytest.mark.asyncio
async def test_linux_event_parsing(client: AsyncClient, db: AsyncSession, setup_agent: Agent):
    """Test parsing Linux SSH events"""
    event_id = str(uuid.uuid4())
    linux_payload = json.dumps({
        "message": "Accepted publickey for admin_user from 10.0.0.50 port 50130 ssh2",
        "process": "sshd"
    })

    event_req = {
        "event_id": event_id,
        "agent_id": setup_agent.agent_id,
        "hostname": "linux-host",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "auth",
        "source": "syslog",
        "payload": linux_payload
    }

    res = await client.post("/api/v1/agent/events", json=event_req, headers=AUTH_HEADERS)
    assert res.status_code == 202

    stmt = select(Event).where(Event.event_id == event_id)
    result = await db.execute(stmt)
    evt = result.scalar_one()

    assert evt.event_category == "linux"
    assert evt.event_type == "ssh_login"
    assert evt.action == "login_success"
    assert evt.username == "admin_user"
    assert evt.source_ip == "10.0.0.50"

@pytest.mark.asyncio
async def test_invalid_envelope(client: AsyncClient, setup_agent: Agent):
    """Test that missing required fields reject the request."""
    event_req = {
        "event_id": str(uuid.uuid4()),
        "agent_id": setup_agent.agent_id,
        # missing timestamp, hostname, event_type, source, payload
    }
    res = await client.post("/api/v1/agent/events", json=event_req, headers=AUTH_HEADERS)
    assert res.status_code == 422 # FastAPI Pydantic validation error

@pytest.mark.asyncio
async def test_duplicate_event_handling(client: AsyncClient, db: AsyncSession, setup_agent: Agent):
    """Test duplicate event IDs are gracefully ignored."""
    event_id = str(uuid.uuid4())
    event_req = {
        "event_id": event_id,
        "agent_id": setup_agent.agent_id,
        "hostname": setup_agent.hostname,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "test",
        "source": "test",
        "payload": "{}"
    }

    # First insert
    res1 = await client.post("/api/v1/agent/events", json=event_req, headers=AUTH_HEADERS)
    assert res1.status_code == 202

    # Second insert
    res2 = await client.post("/api/v1/agent/events", json=event_req, headers=AUTH_HEADERS)
    assert res2.status_code == 202 # Should ignore duplicate but return 202

    # Ensure only 1 event and 1 raw log
    stmt = select(RawLog).where(RawLog.event_identifier == event_id)
    result = await db.execute(stmt)
    raws = result.scalars().all()
    assert len(raws) == 1

@pytest.mark.asyncio
async def test_unsupported_or_malformed_json_payload(client: AsyncClient, db: AsyncSession, setup_agent: Agent):
    """Test parser handles invalid JSON or unsupported event gracefully without crashing."""
    event_id = str(uuid.uuid4())
    event_req = {
        "event_id": event_id,
        "agent_id": setup_agent.agent_id,
        "hostname": setup_agent.hostname,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "test",
        "source": "custom",
        "payload": "NOT_JSON!!!"
    }

    res = await client.post("/api/v1/agent/events", json=event_req, headers=AUTH_HEADERS)
    assert res.status_code == 202

    # Check normalized event has defaults and didn't crash
    stmt = select(Event).where(Event.event_id == event_id)
    result = await db.execute(stmt)
    evt = result.scalar_one()
    assert evt.event_category == "unknown"
    assert evt.event_type == "test"

@pytest.mark.asyncio
async def test_missing_optional_fields_and_metadata(client: AsyncClient, db: AsyncSession, setup_agent: Agent):
    """Test when an event lacks operating_system or metadata, it defaults correctly."""
    event_id = str(uuid.uuid4())
    event_req = {
        "event_id": event_id,
        "agent_id": setup_agent.agent_id,
        "hostname": setup_agent.hostname,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "test",
        "source": "test",
        "payload": "{}"
        # Missing operating_system and metadata
    }

    res = await client.post("/api/v1/agent/events", json=event_req, headers=AUTH_HEADERS)
    assert res.status_code == 202

    stmt = select(Event).where(Event.event_id == event_id)
    result = await db.execute(stmt)
    evt = result.scalar_one()

    # Should inherit OS from agent
    assert evt.operating_system == setup_agent.operating_system
    # Should still get collector metadata enriched
    assert "collector_id" in evt.metadata_

@pytest.mark.asyncio
async def test_multiple_agents(client: AsyncClient, db: AsyncSession):
    """Test isolation between multiple agents"""
    # Agent 1
    a1_id = str(uuid.uuid4())
    await client.post("/api/v1/agent/register", json={"agent_id": a1_id, "hostname": "h1", "operating_system": "linux", "agent_version": "1.0"}, headers=AUTH_HEADERS)
    # Agent 2
    a2_id = str(uuid.uuid4())
    await client.post("/api/v1/agent/register", json={"agent_id": a2_id, "hostname": "h2", "operating_system": "linux", "agent_version": "1.0"}, headers=AUTH_HEADERS)

    res1 = await client.post("/api/v1/agent/events", json={
        "event_id": str(uuid.uuid4()), "agent_id": a1_id, "hostname": "h1",
        "timestamp": datetime.now(timezone.utc).isoformat(), "event_type": "t1", "source": "s1", "payload": "{}"
    }, headers=AUTH_HEADERS)

    res2 = await client.post("/api/v1/agent/events", json={
        "event_id": str(uuid.uuid4()), "agent_id": a2_id, "hostname": "h2",
        "timestamp": datetime.now(timezone.utc).isoformat(), "event_type": "t2", "source": "s2", "payload": "{}"
    }, headers=AUTH_HEADERS)

    assert res1.status_code == 202
    assert res2.status_code == 202
