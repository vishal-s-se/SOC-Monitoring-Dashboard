import pytest
from httpx import AsyncClient
from backend.app.main import app

@pytest.mark.asyncio
async def test_system_health_overview():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/api/v1/health/overview")
    assert response.status_code == 200
    data = response.json()
    assert "overall_status" in data
    assert "services" in data
    assert "queues" in data
    assert "active_agents" in data

@pytest.mark.asyncio
async def test_system_health_services():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/api/v1/health/services")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "service" in data[0]

@pytest.mark.asyncio
async def test_system_health_queue():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/api/v1/health/queue")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "queue_name" in data[0]
