"""Liveness, readiness and a human-friendly status page for judges and operators."""

from __future__ import annotations

import asyncio
from typing import Any, Dict

import httpx
from fastapi import APIRouter

from indra_climate import get_atlas

from .. import __version__
from ..ai.service import get_ai
from ..config import get_settings
from ..services.stores import get_store

router = APIRouter(tags=["health"])


@router.get("/")
async def root() -> Dict[str, Any]:
    return {"service": "INDRA API", "version": __version__, "status": "operational",
            "theme": "Too much water, too little of it, and the heat in between.", "docs": "/docs"}


@router.get("/health")
async def liveness() -> Dict[str, str]:
    return {"status": "healthy", "service": "INDRA Backend"}


@router.get("/ready")
async def readiness() -> Dict[str, Any]:
    atlas = get_atlas()
    ready = atlas.loaded or bool(atlas.load())
    return {"status": "ready" if ready else "starting", "districts": len(atlas) if ready else 0}


@router.get("/api/status")
async def status() -> Dict[str, Any]:
    settings = get_settings()
    ai = get_ai()
    atlas = get_atlas().load()
    store = await asyncio.to_thread(get_store)
    telemetry = "unreachable"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            telemetry = "ok" if (await client.get(f"{settings.telemetry_url}/healthz")).status_code == 200 else "error"
    except httpx.HTTPError:
        pass
    return {
        "version": __version__,
        "config": settings.summary(),
        "components": {
            "climate_atlas": {"districts": len(atlas), "states": len(atlas.states())},
            "ai": await asyncio.to_thread(ai.status),
            "alerts_store": {"backend": store.name, "healthy": await asyncio.to_thread(store.healthy)},
            "telemetry": telemetry,
        },
    }
