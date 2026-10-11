"""INDRA-Gramin water budgeting: split a village household's daily water between people, cattle and fields."""

from __future__ import annotations

import asyncio
from typing import Dict, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from indra_climate import assess_risk

from ..ai.service import AIUnavailable, get_ai
from ..core.errors import AppError
from ..data.gis import gis_manager, split_location

router = APIRouter(prefix="/api/gramin/water-management", tags=["gramin"])
SEASONS = {"summer", "monsoon", "winter"}
BUCKET_L = 20  # 1 bucket = 20 litres


class WaterManagementRequest(BaseModel):
    location: Optional[str] = Field(None, max_length=160)
    pincode: Optional[str] = Field(None, pattern=r"^\d{6}$")
    season: str = "monsoon"
    crop_type: Optional[str] = Field(None, max_length=60)
    cattle_count: int = Field(10, ge=0, le=5000)
    household_members: int = Field(4, ge=1, le=200)
    farm_size_acres: float = Field(2.0, ge=0, le=100000)


class WaterDistribution(BaseModel):
    irrigation_buckets: int
    cattle_buckets: int
    drinking_buckets: int
    irrigation_pct: float
    cattle_pct: float
    drinking_pct: float


class WaterManagementResponse(BaseModel):
    distribution: WaterDistribution
    recommendations: List[str]
    ai_insights: str
    water_status: str
    gis_summary: str
    climate: Dict[str, object]
    ai_enhanced: bool


def compute_distribution(req: WaterManagementRequest, season_rain: float, annual_rain: float, stage: float,
                         heat_score: float):
    """Daily bucket budget. Heat raises people/cattle needs; scarce groundwater trims irrigation."""
    season = req.season.lower()
    drinking = req.household_members * 2.0
    cattle = req.cattle_count * 2.0
    irrigation = req.farm_size_acres * 10.0

    if season == "summer":
        scarce = season_rain < 30
        drinking *= 1.3 if scarce else 1.2
        cattle *= 1.4 if scarce else 1.3
        irrigation *= 1.5 if scarce else 1.4
    elif season == "winter":
        irrigation *= 0.7
        cattle *= 0.9
    else:  # monsoon
        irrigation *= 0.3 if season_rain > 300 else 0.5
    heat_uplift = 1.0 + 0.25 * min(heat_score, 100) / 100 if season == "summer" else 1.0
    drinking, cattle = drinking * heat_uplift, cattle * heat_uplift

    if stage > 100:
        drinking, cattle, irrigation = drinking * 0.9, cattle * 0.8, irrigation * 0.6
    elif stage > 90:
        irrigation *= 0.7

    d, c, i = (int(round(x)) for x in (drinking, cattle, irrigation))
    total = max(d + c + i, 1)
    dist = WaterDistribution(irrigation_buckets=i, cattle_buckets=c, drinking_buckets=d,
                             irrigation_pct=round(i / total * 100, 1), cattle_pct=round(c / total * 100, 1),
                             drinking_pct=round(d / total * 100, 1))

    if stage > 100:
        status = "Critical - Water Outsourcing Needed"
    elif stage > 90 or (season == "summer" and season_rain < 30):
        status = "Moderate - Strict Conservation Required"
    elif season == "monsoon" and season_rain > 300:
        status = "Surplus - Rainwater Harvesting Recommended"
    elif stage <= 70 and annual_rain > 800:
        status = "Sufficient - Manage Wisely"
    else:
        status = "Normal - Conservation Advised"
    return dist, status


def baseline_tips(req: WaterManagementRequest, status: str, climate: Dict) -> List[str]:
    season = req.season.lower()
    flood, drought, heat = (climate["scores"][k]["score"] for k in ("flood", "drought", "heat"))
    tips: List[str] = []
    if season == "monsoon":
        tips.append("Dig or desilt a farm pond and field bunds now so monsoon runoff is stored, not lost.")
        if flood >= 50:
            tips.append("Keep drainage channels open and move cattle feed and seed above flood level before heavy spells.")
    elif season == "summer":
        tips.append("Irrigate at dawn or dusk and mulch the soil to cut evaporation.")
        if heat >= 55:
            tips.append("Shade cattle sheds and keep clean water available all day; heat raises their need sharply.")
    else:
        tips.append("Use the dry months to repair channels and check tank and pond seepage before the next rains.")
    if "Critical" in status or drought >= 60:
        tips.append("Prefer drip or furrow irrigation and crops that need less water; avoid new borewells.")
    tips.append(f"Store drinking water first: {req.household_members * 2} buckets a day covers the family.")
    return tips[:4]


@router.post("/predict", response_model=WaterManagementResponse)
async def predict(req: WaterManagementRequest) -> WaterManagementResponse:
    if not (req.pincode or req.location):
        raise AppError(400, "Provide a pincode or a location (District, State).")
    if req.season.lower() not in SEASONS:
        raise AppError(422, f"season must be one of {sorted(SEASONS)}")
    district, state = split_location(req.location)
    gis = gis_manager.get_location_data(pincode=req.pincode, district=district, state=state)
    if not gis:
        raise AppError(404, "No data found for that pincode/location. Please verify it.")

    rain, stage = gis["rainfall"], gis["groundwater"]["extraction_percentage"]
    season_key = {"monsoon": "monsoon", "summer": "summer", "winter": "winter"}[req.season.lower()]
    season_rain = rain[season_key]
    climate = assess_risk(gis["record"]).to_dict()
    dist, status = compute_distribution(req, season_rain, rain["total_annual"], stage, climate["scores"]["heat"]["score"])
    stress = gis_manager.get_water_stress_level(gis)
    summary = (f"{gis['district']}, {stress} stress level, {rain['total_annual']:.0f}mm annual rainfall, "
               f"{stage:.1f}% groundwater extraction")

    tips = baseline_tips(req, status, climate)
    insights = (f"{gis['district']} gets {rain['total_annual']:.0f} mm a year, {season_rain:.0f} mm of it in the "
                f"{req.season.lower()} season. Groundwater is {stress.lower()} ({stage:.0f}% extracted). "
                f"Flood risk {climate['scores']['flood']['level']}, drought risk {climate['scores']['drought']['level']}, "
                f"heat risk {climate['scores']['heat']['level']}.")
    ai_enhanced = False

    ai = get_ai()
    if ai.llm.available:
        place = f"{gis['district']} {gis['state']}"
        context = await ai.rag_context(f"water management {req.season} {req.crop_type or 'farming'} rural india {status}", k=2, max_chars=250)
        hazards = ", ".join(k + " " + v["level"] for k, v in climate["scores"].items())
        facts = (f"GIS: {summary}. Status: {status}. Season: {req.season}. Crop: {req.crop_type or 'General'}. "
                 f"Cattle: {req.cattle_count}. Family: {req.household_members}. Farm: {req.farm_size_acres:.1f} acres. "
                 f"Climate: {hazards}.")
        insight_task = ai.text(f"Reference:\n{context}\n\n{facts}\n\nGive 2 specific water management tips for this "
                               f"farm in under 80 words. Practical, no emoji.", max_tokens=200)
        tips_task = ai.bullet_list(f"Reference:\n{context}\n\n{facts}\n\nGive exactly 3 specific, actionable water "
                                   f"recommendations, one per line, no numbering, no emoji.", limit=3)
        insight_r, tips_r = await asyncio.gather(insight_task, tips_task, return_exceptions=True)
        if isinstance(insight_r, str):
            insights, ai_enhanced = insight_r, True
        if isinstance(tips_r, list):
            tips, ai_enhanced = tips_r, True
        for r in (insight_r, tips_r):
            if isinstance(r, Exception) and not isinstance(r, AIUnavailable):
                raise r

    return WaterManagementResponse(distribution=dist, recommendations=tips, ai_insights=insights, water_status=status,
                                   gis_summary=summary, climate=climate, ai_enhanced=ai_enhanced)


@router.get("/tips")
async def tips(season: str = Query(..., description="summer | monsoon | winter"),
               crop_type: Optional[str] = Query(None, max_length=60)) -> Dict[str, List[str]]:
    if season.lower() not in SEASONS:
        raise AppError(422, f"season must be one of {sorted(SEASONS)}")
    ai = get_ai()
    query = f"water conservation tips {season} {crop_type or 'general'} rural india agriculture"
    try:
        context = await ai.rag_context(query, k=2, max_chars=250)
        return {"tips": await ai.bullet_list(
            f"Context: {context}\n\nGive exactly 3 practical water conservation tips for the {season} season"
            f"{f' and {crop_type} crop' if crop_type else ''}. One per line, under 14 words each, no numbering.", limit=3)}
    except AIUnavailable:
        passages = await ai.search(query, k=3)
        if not passages:
            raise AppError(503, "Tips are unavailable right now: the AI model and knowledge base are both offline.")
        return {"tips": [p.text[:140].strip() + "..." for p in passages]}
