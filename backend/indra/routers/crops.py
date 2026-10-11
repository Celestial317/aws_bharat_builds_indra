"""INDRA-Gramin smart cropping: rank crops by revenue per litre of water, adjusted for local conditions."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from indra_climate import assess_risk

from ..ai.service import AIUnavailable, get_ai
from ..core.errors import AppError
from ..data.crops import ACRE_MM_TO_LITRES, CROPS, WATER_BUDGET_MM, Crop
from ..data.gis import gis_manager, split_location

router = APIRouter(prefix="/api/gramin", tags=["gramin"])
SEASONS = {"kharif": "Kharif", "rabi": "Rabi", "zaid": "Zaid"}


class CropInput(BaseModel):
    location: str = Field(..., min_length=2, max_length=160, description="District, State")
    pincode: Optional[str] = Field(None, pattern=r"^\d{6}$")
    soil_type: str = Field(..., max_length=30)
    season: str = Field(..., description="Kharif | Rabi | Zaid")
    water_availability: str = Field(..., description="Low | Medium | High")
    farm_size_acres: float = Field(..., gt=0, le=100000)
    rainfall_mm: Optional[float] = Field(None, ge=0, le=15000, description="Optional override of annual rainfall")


class CropRecommendation(BaseModel):
    crop_name: str
    water_requirement_liters: float
    estimated_market_price_per_kg: float
    yield_per_acre_kg: float
    total_profit_estimate: float
    price_per_liter_ratio: float
    environmental_impact_score: int
    soil_health_impact: str
    farmer_ease_score: int
    rank: int
    justification: str


class CropSuggestionResponse(BaseModel):
    recommendations: List[CropRecommendation]
    season_context: str
    water_context: str
    general_advice: str
    data_note: str = ("Prices, yields and costs are indicative national averages. Confirm with your local mandi "
                      "and Krishi Vigyan Kendra before committing.")
    ai_enhanced: bool = False


def score_crop(crop: Crop, soil: str, budget_mm: float, stage: float, flood: float, drought: float):
    """Return (score, profit_per_acre) or None when the crop is unsuitable. Higher score is better."""
    profit = crop.yield_kg_acre * crop.price_kg - crop.cost_acre
    if profit <= 0:
        return None
    revenue_per_litre = crop.yield_kg_acre * crop.price_kg / crop.water_litres_acre
    score = revenue_per_litre * 100
    score *= 1.15 if soil in crop.soils else 0.7                      # soil fit
    if crop.water_mm > budget_mm:                                      # more water than the farm can count on
        score *= max(0.15, budget_mm / crop.water_mm) ** 1.5
    if stage >= 90 and crop.water_mm > 700:                            # over-stressed aquifer: avoid thirsty crops
        score *= 0.6
    if drought >= 60 and crop.drought_hardy:
        score *= 1.2
    if flood >= 60 and crop.flood_tolerant:
        score *= 1.15
    score *= 0.85 + 0.03 * crop.env_score                              # gentle nudge to sustainable crops
    if not crop.msp_backed:                                            # volatile prices + high cash outlay
        score *= 0.45
    return score, profit


def rank_crops(inp: CropInput, annual_rain: float, stage: float, flood: float, drought: float) -> List[CropRecommendation]:
    season = SEASONS.get(inp.season.lower())
    if not season:
        raise AppError(422, "season must be Kharif, Rabi or Zaid")
    level = inp.water_availability.lower()
    if level not in WATER_BUDGET_MM:
        raise AppError(422, "water_availability must be Low, Medium or High")
    soil = inp.soil_type.strip().title()
    budget_mm = WATER_BUDGET_MM[level]
    if inp.rainfall_mm and level == "low":
        budget_mm = min(budget_mm, max(150.0, inp.rainfall_mm * 0.6))

    scored = []
    for crop in CROPS:
        if season not in crop.seasons:
            continue
        result = score_crop(crop, soil, budget_mm, stage, flood, drought)
        if result:
            scored.append((result[0], result[1], crop))
    scored.sort(key=lambda t: -t[0])

    out: List[CropRecommendation] = []
    for rank, (_, profit, crop) in enumerate(scored[:5], start=1):
        why = []
        why.append("Sips water" if crop.water_mm <= 400 else "Thirsty crop" if crop.water_mm >= 900 else "Moderate water need")
        why.append("suits your soil" if soil in crop.soils else "soil is not ideal")
        if crop.soil_health == "Positive":
            why.append("improves soil")
        if not crop.msp_backed:
            why.append("prices swing, no assured MSP")
        out.append(CropRecommendation(
            crop_name=crop.name, water_requirement_liters=crop.water_litres_acre,
            estimated_market_price_per_kg=crop.price_kg, yield_per_acre_kg=crop.yield_kg_acre,
            total_profit_estimate=round(profit * inp.farm_size_acres),
            price_per_liter_ratio=round(crop.yield_kg_acre * crop.price_kg / crop.water_litres_acre, 3),
            environmental_impact_score=crop.env_score, soil_health_impact=crop.soil_health,
            farmer_ease_score=crop.ease, rank=rank, justification=", ".join(why).capitalize()))
    if not out:
        raise AppError(404, f"No suitable {season} crops found for these conditions.")
    return out


@router.post("/crop-suggestions", response_model=CropSuggestionResponse)
async def suggest_crops(inp: CropInput) -> CropSuggestionResponse:
    district, state = split_location(inp.location)
    gis = gis_manager.get_location_data(pincode=inp.pincode, district=district, state=state)
    if not gis:
        raise AppError(404, "No data found for that location. Check the district name or pincode.")
    annual = inp.rainfall_mm or gis["rainfall"]["total_annual"]
    stage = gis["groundwater"]["extraction_percentage"]
    climate = assess_risk(gis["record"])
    recs = rank_crops(inp, annual, stage, climate.scores["flood"]["score"], climate.scores["drought"]["score"])

    season = SEASONS[inp.season.lower()]
    season_context = {
        "Kharif": "Kharif crops ride the monsoon: sow with the first good rains, and keep drainage ready for heavy spells.",
        "Rabi": "Rabi crops grow on stored soil moisture and winter irrigation: conserve post-monsoon water now.",
        "Zaid": "Zaid is the hot, dry stretch: choose short-duration crops and irrigate at dawn or dusk.",
    }[season]
    water_context = (f"{gis['district']} gets about {annual:.0f} mm a year; groundwater extraction is {stage:.0f}% of "
                     f"recharge. You told us water is {inp.water_availability.lower()}.")
    advice = (f"Flood risk here is {climate.scores['flood']['level']}, drought risk {climate.scores['drought']['level']}, "
              f"heat risk {climate.scores['heat']['level']}. Rank 1 gives the most rupees per litre of water.")
    ai_enhanced = False

    ai = get_ai()
    if ai.llm.available:
        try:
            ctx = await ai.rag_context(f"crop {season} {inp.soil_type} soil water saving {gis['state']}", k=2, max_chars=300)
            names = ", ".join(r.crop_name for r in recs)
            reply = await ai.text(
                f"Reference:\n{ctx}\n\nFarm: {gis['district']}, {gis['state']}; {season} season; {inp.soil_type} soil; "
                f"{inp.water_availability} water; {inp.farm_size_acres} acres. Ranked crops: {names}. "
                f"Write one practical sentence of advice (under 30 words) for growing these with less water. No emoji.",
                max_tokens=120)
            advice, ai_enhanced = f"{advice} {reply}", True
        except AIUnavailable:
            pass

    return CropSuggestionResponse(recommendations=recs, season_context=season_context, water_context=water_context,
                                  general_advice=advice, ai_enhanced=ai_enhanced)
