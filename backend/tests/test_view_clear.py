import pytest_asyncio
import pytest
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(".env.test")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from httpx import AsyncClient, ASGITransport

from backend.app.main import app
from backend.app.db.base_class import Base
from backend.app.models.event import Event
from backend.app.models.view_clear_marker import ViewClearMarker

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
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_view_clear_marker_workflow(db: AsyncSession, client: AsyncClient):
    # Create test events for Windows and Linux
    ev1 = Event(
        event_id="test-win-evt-001",
        timestamp=datetime.now(timezone.utc),
        operating_system="Windows",
        event_category="authentication",
        event_type="logon",
        severity="low"
    )
    ev2 = Event(
        event_id="test-win-evt-002",
        timestamp=datetime.now(timezone.utc),
        operating_system="Windows",
        event_category="authentication",
        event_type="logon",
        severity="low"
    )
    ev3 = Event(
        event_id="test-linux-evt-001",
        timestamp=datetime.now(timezone.utc),
        operating_system="Linux",
        event_category="authentication",
        event_type="ssh",
        severity="low"
    )
    db.add_all([ev1, ev2, ev3])
    await db.commit()
    await db.refresh(ev1)
    await db.refresh(ev2)
    await db.refresh(ev3)

    # 1. Query active windows authentication events
    res = await client.get("/api/v1/events/?operating_system=windows&view_category=authentication")
    assert res.status_code == 200
    data = res.json()
    item_ids = [item["id"] for item in data["items"]]
    assert ev1.id in item_ids
    assert ev2.id in item_ids

    # 2. Clear Windows Authentication view
    clear_res = await client.post(
        "/api/v1/events/view-clear",
        json={"operating_system": "windows", "category": "authentication"}
    )
    assert clear_res.status_code == 200
    marker = clear_res.json()
    assert marker["operating_system"] == "windows"
    assert marker["category"] == "authentication"
    assert marker["last_cleared_event_id"] >= ev2.id

    # 3. Active Windows authentication view should now hide cleared events
    res_after = await client.get("/api/v1/events/?operating_system=windows&view_category=authentication")
    assert res_after.status_code == 200
    after_items = res_after.json()["items"]
    after_ids = [item["id"] for item in after_items]
    assert ev1.id not in after_ids
    assert ev2.id not in after_ids

    # 4. History view (include_cleared=true) MUST still contain all events (non-destructive preservation)
    history_res = await client.get("/api/v1/events/?operating_system=windows&include_cleared=true")
    assert history_res.status_code == 200
    hist_ids = [item["id"] for item in history_res.json()["items"]]
    assert ev1.id in hist_ids
    assert ev2.id in hist_ids

    # 5. Linux events must NOT be affected
    linux_res = await client.get("/api/v1/events/?operating_system=linux&view_category=authentication")
    assert linux_res.status_code == 200
    linux_ids = [item["id"] for item in linux_res.json()["items"]]
    assert ev3.id in linux_ids

    # 6. Newly ingested Windows event after clear watermark MUST appear in active view
    ev_new = Event(
        event_id="test-win-evt-003",
        timestamp=datetime.now(timezone.utc),
        operating_system="Windows",
        event_category="authentication",
        event_type="logon_new",
        severity="high"
    )
    db.add(ev_new)
    await db.commit()
    await db.refresh(ev_new)

    res_new = await client.get("/api/v1/events/?operating_system=windows&view_category=authentication")
    assert res_new.status_code == 200
    new_active_ids = [item["id"] for item in res_new.json()["items"]]
    assert ev_new.id in new_active_ids

@pytest.mark.asyncio
async def test_overall_dashboard_view_clear(db: AsyncSession, client: AsyncClient):
    # Setup cross-platform events
    w1 = Event(
        event_id="test-all-win-001",
        timestamp=datetime.now(timezone.utc),
        operating_system="Windows",
        event_category="security",
        event_type="logon",
        severity="medium"
    )
    l1 = Event(
        event_id="test-all-lin-001",
        timestamp=datetime.now(timezone.utc),
        operating_system="Linux",
        event_category="auth",
        event_type="sudo",
        severity="medium"
    )
    db.add_all([w1, l1])
    await db.commit()
    await db.refresh(w1)
    await db.refresh(l1)

    # 1. Query overall aggregated stream
    res_overall = await client.get("/api/v1/events/")
    assert res_overall.status_code == 200
    overall_ids = [item["id"] for item in res_overall.json()["items"]]
    assert w1.id in overall_ids
    assert l1.id in overall_ids

    # 2. Clear Overall Dashboard (operating_system='all', category='all')
    clear_res = await client.post(
        "/api/v1/events/view-clear",
        json={"operating_system": "all", "category": "all"}
    )
    assert clear_res.status_code == 200
    marker = clear_res.json()
    assert marker["operating_system"] == "all"
    assert marker["category"] == "all"
    assert marker["last_cleared_event_id"] >= max(w1.id, l1.id)

    # 3. Overall view should now be clear
    res_cleared = await client.get("/api/v1/events/")
    assert res_cleared.status_code == 200
    cleared_ids = [item["id"] for item in res_cleared.json()["items"]]
    assert w1.id not in cleared_ids
    assert l1.id not in cleared_ids

    # 4. OS History tabs with include_cleared=true MUST retain all raw events
    win_hist = await client.get("/api/v1/events/?operating_system=windows&include_cleared=true")
    assert win_hist.status_code == 200
    assert w1.id in [item["id"] for item in win_hist.json()["items"]]

    lin_hist = await client.get("/api/v1/events/?operating_system=linux&include_cleared=true")
    assert lin_hist.status_code == 200
    assert l1.id in [item["id"] for item in lin_hist.json()["items"]]
