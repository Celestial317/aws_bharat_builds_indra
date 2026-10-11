"""Central configuration. Everything comes from environment variables (or a .env file).

No secrets live in code. ``Settings`` is immutable and cached; use :func:`get_settings`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import List

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

# The repo-root .env wins; backend/.env is honoured for stand-alone use.
load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def _list(name: str, default: str) -> List[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # --- server
    env: str = field(default_factory=lambda: os.getenv("INDRA_ENV", "development"))
    host: str = field(default_factory=lambda: os.getenv("SERVER_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: _int("PORT", _int("SERVER_PORT", 8000)))
    debug: bool = field(default_factory=lambda: _bool("DEBUG_MODE"))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO").upper())
    cors_origins: List[str] = field(default_factory=lambda: _list(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"))
    rate_limit_per_minute: int = field(default_factory=lambda: _int("RATE_LIMIT_PER_MINUTE", 120))
    ai_rate_limit_per_minute: int = field(default_factory=lambda: _int("AI_RATE_LIMIT_PER_MINUTE", 20))

    # --- LLM (any OpenAI-compatible endpoint: OpenRouter, Ollama, vLLM, ...)
    llm_api_key: str = field(default_factory=lambda: os.getenv("LLM_API_KEY") or os.getenv("OPENROUTER_API_KEY", ""))
    llm_base_url: str = field(default_factory=lambda: os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1"))
    llm_model: str = field(default_factory=lambda: os.getenv("LLM_MODEL", "nvidia/nemotron-nano-12b-v2-vl:free"))
    llm_temperature: float = field(default_factory=lambda: _float("LLM_TEMPERATURE", 0.3))
    llm_max_tokens: int = field(default_factory=lambda: _int("LLM_MAX_TOKENS", 1500))
    llm_timeout_s: float = field(default_factory=lambda: _float("LLM_TIMEOUT_S", 45.0))
    max_retries: int = field(default_factory=lambda: _int("MAX_RETRIES", 3))
    retry_delay_s: float = field(default_factory=lambda: _float("RETRY_DELAY", 1.0))

    # --- knowledge base / RAG (OpenSearch k-NN, with a local on-disk fallback)
    opensearch_url: str = field(default_factory=lambda: os.getenv("OPENSEARCH_URL", ""))
    opensearch_index: str = field(default_factory=lambda: os.getenv("OPENSEARCH_INDEX", "indra-knowledge"))
    opensearch_user: str = field(default_factory=lambda: os.getenv("OPENSEARCH_USER", ""))
    opensearch_password: str = field(default_factory=lambda: os.getenv("OPENSEARCH_PASSWORD", ""))
    embedding_model_path: str = field(default_factory=lambda: os.getenv(
        "EMBEDDING_MODEL_PATH", str(BACKEND_DIR / "models" / "all-MiniLM-L6-v2")))
    knowledge_local_path: str = field(default_factory=lambda: os.getenv(
        "KNOWLEDGE_LOCAL_PATH", str(REPO_ROOT / "data" / "index" / "knowledge")))
    rag_top_k: int = field(default_factory=lambda: _int("RAG_RETRIEVER_K", 3))

    # --- auth
    firebase_project_id: str = field(default_factory=lambda: os.getenv("FIREBASE_PROJECT_ID", "indra-164b4"))
    auth_mode: str = field(default_factory=lambda: os.getenv("AUTH_MODE", "").lower())  # firebase | demo
    admin_uids: List[str] = field(default_factory=lambda: _list("ADMIN_UIDS", ""))

    # --- AWS-compatible services (LocalStack in dev; real AWS if you choose)
    aws_endpoint_url: str = field(default_factory=lambda: os.getenv("AWS_ENDPOINT_URL", ""))
    aws_region: str = field(default_factory=lambda: os.getenv("AWS_REGION", "ap-south-1"))
    alerts_backend: str = field(default_factory=lambda: os.getenv("ALERTS_BACKEND", "").lower())  # memory | dynamodb
    subscriptions_table: str = field(default_factory=lambda: os.getenv("SUBSCRIPTIONS_TABLE", "IndraSubscriptions"))
    alerts_table: str = field(default_factory=lambda: os.getenv("ALERTS_TABLE", "IndraAlerts"))
    telemetry_url: str = field(default_factory=lambda: os.getenv("TELEMETRY_URL", "http://127.0.0.1:8090"))
    telemetry_service_key: str = field(default_factory=lambda: os.getenv("TELEMETRY_SERVICE_KEY", "dev-service-key"))

    # --- features
    vendor_live_search: bool = field(default_factory=lambda: _bool("VENDOR_LIVE_SEARCH", True))
    ai_warmup: bool = field(default_factory=lambda: _bool("AI_WARMUP", True))
    forecast_enabled: bool = field(default_factory=lambda: _bool("FORECAST_ENABLED", True))

    @property
    def effective_auth_mode(self) -> str:
        """``firebase`` when verifying real tokens, ``demo`` for local development only."""
        if self.auth_mode in {"firebase", "demo"}:
            return self.auth_mode
        return "firebase" if self.env == "production" else "demo"

    @property
    def effective_alerts_backend(self) -> str:
        if self.alerts_backend in {"memory", "dynamodb"}:
            return self.alerts_backend
        return "dynamodb" if self.aws_endpoint_url else "memory"

    @property
    def llm_configured(self) -> bool:
        local = self.llm_base_url.startswith(("http://localhost", "http://127.0.0.1", "http://host.docker.internal"))
        return bool(self.llm_api_key) or local

    def summary(self) -> dict:
        """Safe-to-log view of the configuration (no secrets)."""
        return {
            "env": self.env,
            "auth_mode": self.effective_auth_mode,
            "llm_model": self.llm_model,
            "llm_base_url": self.llm_base_url,
            "llm_configured": self.llm_configured,
            "knowledge_backend": "opensearch" if self.opensearch_url else "local",
            "opensearch_index": self.opensearch_index,
            "alerts_backend": self.effective_alerts_backend,
            "aws_endpoint_url": self.aws_endpoint_url or None,
            "telemetry_url": self.telemetry_url,
            "cors_origins": self.cors_origins,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
