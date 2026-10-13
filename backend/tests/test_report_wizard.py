import pytest
import pytest_asyncio
import os
from dotenv import load_dotenv

load_dotenv(".env.test")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from httpx import AsyncClient

from backend.app.main import app
from backend.app.db.base_class import Base

url = os.getenv("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/soc_monitor_test")
engine = create_async_engine(url, poolclass=NullPool)
TestingSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

@pytest_asyncio.fixture
async def db():
    async with engine.begin() as conn:
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
    app.dependency_overrides.pop(get_db, None)

@pytest.mark.asyncio
async def test_report_wizard_preview_and_pdf(client: AsyncClient):
    # Test Preview endpoint
    preview_res = await client.post("/api/v1/reports/wizard/preview", json={
        "title": "SOCForge Pytest Audit",
        "period_preset": "24h",
        "sections": ["executive_summary", "alerts"],
        "presentation_format": "graphs_and_text"
    })
    assert preview_res.status_code == 200, preview_res.text
    data = preview_res.json()
    assert data["title"] == "SOCForge Pytest Audit"
    assert "data_availability" in data
    assert "events_count" in data["data_availability"]

    # Test PDF Generation endpoint
    pdf_res = await client.post("/api/v1/reports/wizard/generate-pdf", json={
        "title": "SOCForge Pytest Audit",
        "period_preset": "24h",
        "sections": ["executive_summary", "alerts", "events"],
        "presentation_format": "graphs_and_text"
    })
    assert pdf_res.status_code == 200, pdf_res.text
    assert pdf_res.headers.get("content-type") == "application/pdf"
    assert len(pdf_res.content) > 1000
    # Check PDF Magic Bytes
    assert pdf_res.content.startswith(b"%PDF")

@pytest.mark.asyncio
async def test_scoped_log_clear_requires_confirmation(client: AsyncClient):
    # Missing confirm=true should return 400
    fail_res = await client.delete("/api/v1/events/scoped-clear?event_category=authentication")
    assert fail_res.status_code == 400
    assert "Confirmation required" in fail_res.text

    # Missing scope parameters should return 400
    fail_scope = await client.delete("/api/v1/events/scoped-clear?confirm=true")
    assert fail_scope.status_code == 400
    assert "At least one scoping parameter" in fail_scope.text

    # Valid scoped clear
    success_res = await client.delete("/api/v1/events/scoped-clear?event_category=test_cat&confirm=true")
    assert success_res.status_code == 200
    result = success_res.json()
    assert result["status"] == "success"
    assert "records_deleted" in result
