"""Climate risk API: too much water, too little of it, and the heat in between."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from indra_climate import assess_risk, fetch_forecast, get_atlas, water_balance

from ..config import get_settings
from ..core.errors import AppError
from ..data.gis import gis_manager
from ..ai.tools import RUNOFF

router = APIRouter(prefix="/api/climate", tags=["climate"])
_HOTSPOT_CACHE: Dict[str, Any] = {}


def _locate(pincode: Optional[str], district: Optional[str], state: Optional[str]) -> Dict[str, Any]:
    if not (pincode or district or state):
        raise AppError(400, "Provide a pincode, or a district (and optionally state).")
    record = gis_manager.record(pincode=pincode, district=district, state=state)
    if record is None:
        raise AppError(404, "No climate data found for that location.")
    return record


@router.get("/risk")
async def risk(
    pincode: Optional[str] = Query(None, pattern=r"^\d{6}$"),
    district: Optional[str] = Query(None, max_length=80),
    state: Optional[str] = Query(None, max_length=80),
    live: bool = Query(True, description="Include the live 7-day forecast when reachable"),
    roof_area_sqm: Optional[float] = Query(None, ge=1, le=100000),
    members: int = Query(4, ge=1, le=200),
    roof_material: str = Query("RCC"),
) -> Dict[str, Any]:
    """Flood, drought and heat scores, the current season, alerts, and (optionally) a rooftop water balance."""
    record = _locate(pincode, district, state)
    forecast = None
    if live and get_settings().forecast_enabled:
        forecast = await asyncio.to_thread(fetch_forecast, record.get("latitude"), record.get("longitude"))
    report = assess_risk(record, forecast).to_dict()
    report["rainfall_mm"] = {k: v for k, v in record["rainfall"].items() if k != "source"}
    report["groundwater"] = record["groundwater"]
    report["match"] = {"type": record.get("match_type"), "note": record.get("note")}
    report["forecast"] = forecast.to_dict() if forecast else None
    if roof_area_sqm:
        report["water_balance"] = water_balance(record, roof_area_sqm, members, RUNOFF.get(roof_material, 0.8),
                                                heat=report["scores"]["heat"])
    return report


@router.get("/alerts")
async def alerts(
    pincode: Optional[str] = Query(None, pattern=r"^\d{6}$"),
    district: Optional[str] = Query(None, max_length=80),
    state: Optional[str] = Query(None, max_length=80),
) -> Dict[str, Any]:
    record = _locate(pincode, district, state)
    forecast = None
    if get_settings().forecast_enabled:
        forecast = await asyncio.to_thread(fetch_forecast, record.get("latitude"), record.get("longitude"))
    report = assess_risk(record, forecast)
    return {"location": report.location, "alerts": [a.to_dict() for a in report.alerts],
            "forecast_available": forecast is not None}


@router.get("/states")
async def states() -> Dict[str, List[str]]:
    return {"states": get_atlas().states()}


@router.get("/districts")
async def districts(state: str = Query(..., max_length=80)) -> Dict[str, Any]:
    rows = get_atlas().districts(state)
    if not rows:
        raise AppError(404, f"Unknown state '{state}'.")
    return {"state": state, "districts": sorted(d["district"] for d in rows)}


@router.get("/hotspots")
async def hotspots(hazard: str = Query("swing", pattern="^(flood|drought|heat|swing)$"),
                   limit: int = Query(10, ge=1, le=50),
                   state: Optional[str] = Query(None, max_length=80)) -> Dict[str, Any]:
    """Districts ranked by hazard (static climatology). ``swing`` = suffers both flood and scarcity."""
    scored = _scored_districts()
    rows = [r for r in scored if not state or r["state"].lower() == state.lower()]
    key = "swing_index" if hazard == "swing" else hazard
    rows.sort(key=lambda r: -r[key])
    return {"hazard": hazard, "basis": "district climatology, no live forecast", "districts": rows[:limit]}


def _scored_districts() -> List[Dict[str, Any]]:
    cached = _HOTSPOT_CACHE.get("rows")
    if cached and time.monotonic() - _HOTSPOT_CACHE["at"] < 3600:
        return cached
    rows = []
    for rec in get_atlas().districts():
        rep = assess_risk(rec)
        rows.append({"district": rec["district"], "state": rec["state"], "flood": rep.scores["flood"]["score"],
                     "drought": rep.scores["drought"]["score"], "heat": rep.scores["heat"]["score"],
                     "swing_index": rep.overall["swing_index"]})
    _HOTSPOT_CACHE.update(rows=rows, at=time.monotonic())
    return rows
