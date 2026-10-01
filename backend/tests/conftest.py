import pytest
from types import SimpleNamespace
from backend.app.main import app
from backend.app.api.deps import get_current_active_user
from backend.app.core.config import settings

async def mock_get_current_active_user():
    return SimpleNamespace(id=1, username="testadmin", role="ADMIN", status="ACTIVE")

@pytest.fixture(autouse=True)
def override_auth():
    rate_limit_enabled = settings.RATE_LIMIT_ENABLED
    settings.RATE_LIMIT_ENABLED = False
    app.dependency_overrides[get_current_active_user] = mock_get_current_active_user
    yield
    app.dependency_overrides = {}
    settings.RATE_LIMIT_ENABLED = rate_limit_enabled
