"""Smart-tank monitoring. Readings live in the Java telemetry service; this API adds auth + Cedar checks."""

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..config import get_settings
from ..core.errors import AppError
from ..core.logging import get_logger
from ..core.security import Principal, get_principal
from ..policy.authz import authorize

router = APIRouter(prefix="/api/tanks", tags=["tanks"])
log = get_logger("tanks")


class TankIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    capacity_liters: float = Field(..., gt=0, le=10_000_000)
    shared: bool = Field(False, description="Let other droplets see this tank's level")


async def _telemetry(method: str, path: str, **kwargs: Any) -> Any:
    settings = get_settings()
    headers = {"X-Service-Key": settings.telemetry_service_key}
    try:
        async with httpx.AsyncClient(base_url=settings.telemetry_url, timeout=5.0, headers=headers) as client:
            response = await client.request(method, path, **kwargs)
    except httpx.HTTPError as exc:
        log.warning("telemetry unreachable: %s", type(exc).__name__)
        raise AppError(503, "Tank telemetry service is not reachable. Start it with `make dev` or `finch compose up`.") from exc
    if response.status_code == 404:
        raise AppError(404, "Tank not found.")
    if response.status_code >= 400:
        raise AppError(502, f"Telemetry service error ({response.status_code}).")
    return response.json() if response.content else None


async def _owned_tank(tank_id: str, me: Principal, action: str) -> Dict[str, Any]:
    tank = await _telemetry("GET", f"/v1/tanks/{tank_id}")
    authorize(me, action, "Tank", tank_id, {"owner": tank["ownerId"], "shared": bool(tank.get("shared"))})
    return tank


@router.post("", status_code=201)
async def register_tank(body: TankIn, me: Principal = Depends(get_principal)) -> Dict[str, Any]:
    authorize(me, "WriteTank", "Tank", "new", {"owner": me.uid, "shared": body.shared})
    created = await _telemetry("POST", "/v1/tanks", json={
        "name": body.name, "capacityLiters": body.capacity_liters, "ownerId": me.uid, "shared": body.shared})
    return {**created, "note": "Store the deviceKey now: it is shown only once. Sensors send readings with header X-Device-Key."}


@router.get("")
async def my_tanks(me: Principal = Depends(get_principal)) -> Dict[str, Any]:
    return {"tanks": (await _telemetry("GET", "/v1/tanks", params={"owner": me.uid}))["tanks"]}


@router.get("/shared")
async def shared_tanks(me: Principal = Depends(get_principal)) -> Dict[str, Any]:
    return {"tanks": (await _telemetry("GET", "/v1/tanks", params={"shared": "true"}))["tanks"]}


@router.get("/{tank_id}")
async def tank_detail(tank_id: str, me: Principal = Depends(get_principal)) -> Dict[str, Any]:
    return await _owned_tank(tank_id, me, "ReadTank")


@router.delete("/{tank_id}", status_code=204)
async def delete_tank(tank_id: str, me: Principal = Depends(get_principal)) -> None:
    await _owned_tank(tank_id, me, "WriteTank")
    await _telemetry("DELETE", f"/v1/tanks/{tank_id}")
