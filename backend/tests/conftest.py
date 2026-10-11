"""Shared fixtures. Tests run fully offline: no LLM, no OpenSearch, no network forecast."""

import os

os.environ.update({
    "INDRA_ENV": "test",
    "AUTH_MODE": "demo",
    "LLM_API_KEY": "",
    "OPENROUTER_API_KEY": "",
    "LLM_BASE_URL": "https://llm.invalid/v1",
    "OPENSEARCH_URL": "",
    "AWS_ENDPOINT_URL": "",
    "ALERTS_BACKEND": "memory",
    "FORECAST_ENABLED": "false",
    "AI_WARMUP": "false",
    "TELEMETRY_SERVICE_KEY": "test-key",
    "VENDOR_LIVE_SEARCH": "false",
    "RATE_LIMIT_PER_MINUTE": "0",
    "AI_RATE_LIMIT_PER_MINUTE": "0",
    "ADMIN_UIDS": "root-admin",
    "CORS_ORIGINS": "http://localhost:5173",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from indra.config import get_settings  # noqa: E402

get_settings.cache_clear()

from indra.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(create_app()) as c:
        yield c


def as_user(uid: str):
    return {"X-Demo-User": uid}
