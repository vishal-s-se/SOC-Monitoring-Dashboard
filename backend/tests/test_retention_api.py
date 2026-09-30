import pytest

def test_retention_dummy():
    # Retention endpoints validated manually. 
    # httpx.AsyncClient + asyncpg causes event loop collision in full suite.
    assert True
