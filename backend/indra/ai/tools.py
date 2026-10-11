"""Plain-Python tools shared by the Strands agent and the offline chatbot fallback.

They are synchronous, side-effect free and return JSON-serialisable dicts. ``agents.py`` wraps them
with ``strands.tool``; ``climate`` routes call the same functions so the chat agent and the REST
API can never disagree.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Dict, List, Optional

from indra_climate import assess_risk, fetch_forecast, water_balance

from ..config import get_settings
from ..data.gis import gis_manager
from .service import get_ai

RUNOFF = {"RCC": 0.90, "Tiles": 0.85, "Metal": 0.80, "Asbestos": 0.75, "Thatch": 0.60}


def resolve_place(place: str, state: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Find a district record from a free-text place, pincode, or 'District, State'."""
    text = (place or "").strip()
    if not text:
        return None
    if re.fullmatch(r"\d{6}", text):
        return gis_manager.record(pincode=text)
    district, st = text, state
    if "," in text:
        district, st = [p.strip() for p in text.split(",", 1)]
    return gis_manager.record(district=district, state=st)


@lru_cache(maxsize=1)
def _district_names() -> List[str]:
    names = {d["district"] for d in gis_manager.atlas.districts()}
    return sorted(names, key=len, reverse=True)  # longest first: "East Khasi Hills" before "Hills"


def find_place_in_text(text: str) -> Optional[str]:
    """Spot a district name inside a sentence ('how much rain does Pune get?')."""
    lowered = f" {re.sub(r'[^a-z0-9 ]', ' ', text.lower())} "
    for name in _district_names():
        if len(name) >= 4 and f" {name.lower()} " in lowered:
            return name
    pin = re.search(r"\b(\d{6})\b", text)
    return pin.group(1) if pin else None


def climate_summary(place: str, state: Optional[str] = None, live: bool = True) -> Dict[str, Any]:
    """Flood / drought / heat risk, current season and active alerts for a place."""
    record = resolve_place(place, state)
    if record is None:
        return {"error": f"No data for '{place}'. Try a district name or 6-digit pincode."}
    forecast = fetch_forecast(record.get("latitude"), record.get("longitude")) if live and get_settings().forecast_enabled else None
    report = assess_risk(record, forecast).to_dict()
    report["rainfall_mm"] = {k: v for k, v in record["rainfall"].items() if k != "source"}
    report["groundwater_stage_pct"] = record["groundwater"].get("stage_pct")
    report["forecast"] = forecast.to_dict() if forecast else None
    return report


def rwh_potential(place: str, roof_area_sqm: float = 100.0, members: int = 4, roof_material: str = "RCC",
                  state: Optional[str] = None) -> Dict[str, Any]:
    """Rooftop harvest, tank size and dry-season cover for a household at a place."""
    record = resolve_place(place, state)
    if record is None:
        return {"error": f"No data for '{place}'."}
    report = assess_risk(record)
    return {"place": f"{record['district']}, {record['state']}",
            "water_balance": water_balance(record, roof_area_sqm, members, RUNOFF.get(roof_material, 0.8),
                                           heat=report.scores["heat"])}


def knowledge_search(query: str, k: int = 3) -> List[Dict[str, Any]]:
    """Top passages from the RWH / agriculture reference library (with source + page)."""
    ai = get_ai()
    try:
        passages = ai.knowledge._search_sync(query, k)
    except Exception:
        passages = []
    return [p.to_dict() for p in passages]
