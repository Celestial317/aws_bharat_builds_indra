"""FastAPI application factory.  Run:  uvicorn indra.main:app --port 8000"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from indra_climate import get_atlas

from . import __version__
from .ai.service import get_ai
from .config import get_settings
from .core.errors import install_error_handlers
from .core.logging import configure_logging, get_logger
from .core.middleware import RateLimitMiddleware, RequestContextMiddleware
from .routers import alerts, assessment, chat, climate, community, crops, health, tanks, vendors, water

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    if settings.env == "production" and settings.effective_auth_mode == "demo":
        raise RuntimeError("AUTH_MODE=demo is not allowed when INDRA_ENV=production")
    log.info("INDRA %s starting: %s", __version__, settings.summary())
    await asyncio.to_thread(get_atlas().load)

    async def warm() -> None:  # heavy model load must not delay readiness of the rest of the API
        try:
            info = await asyncio.to_thread(get_ai().warm_up)
            log.info("AI warm-up complete: %s", info)
        except Exception:
            log.exception("AI warm-up failed; endpoints will fall back")

    task = asyncio.create_task(warm()) if settings.ai_warmup else None
    yield
    if task:
        task.cancel()
    await get_ai().aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="INDRA API",
        description="Initiative for Drainage and Rainwater Acquisition - too much water, too little of it, "
                    "and the heat in between.",
        version=__version__,
        lifespan=lifespan,
    )
    install_error_handlers(app)
    app.add_middleware(RateLimitMiddleware, general_per_minute=settings.rate_limit_per_minute,
                       ai_per_minute=settings.ai_rate_limit_per_minute)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(  # added last = outermost, so CORS headers are present even on 429/500 responses
        CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials="*" not in settings.cors_origins,
        allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID", "Retry-After"])
    for module in (health, climate, assessment, chat, water, crops, vendors, alerts, tanks, community):
        app.include_router(module.router)
    return app


app = create_app()


def run() -> None:
    settings = get_settings()
    uvicorn.run("indra.main:app", host=settings.host, port=settings.port, reload=settings.debug)


if __name__ == "__main__":
    run()
