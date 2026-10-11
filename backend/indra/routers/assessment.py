"""Urban RWH assessment: deterministic engines first, LLM narrative on top, climate-risk aware."""

from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from indra_climate import assess_risk, fetch_forecast, water_balance

from ..ai.service import AIUnavailable, get_ai
from ..config import get_settings
from ..core.errors import AppError
from ..core.logging import get_logger
from ..data.gis import gis_manager
from ..services.assessment_engine import FeasibilityAnalyzer, RWHCostPredictor, fallback_plan

router = APIRouter(prefix="/api/assessment", tags=["assessment"])
log = get_logger("assessment")

RUNOFF_COEFFICIENTS = {"RCC": 0.90, "Tiles": 0.85, "Metal": 0.80, "Asbestos": 0.75, "Thatch": 0.60}

INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
]
ROOF_TYPES = [
    {"value": "Flat", "label": "Flat Roof", "description": "Horizontal or nearly horizontal roof surface"},
    {"value": "Sloped", "label": "Sloped Roof", "description": "Angled roof (single or gabled)"},
    {"value": "Mixed", "label": "Mixed Roof", "description": "Combination of flat and sloped sections"},
]
ROOF_MATERIALS = [
    {"value": "RCC", "label": "RCC (Reinforced Concrete)", "efficiency": 0.9, "description": "Best for water quality"},
    {"value": "Tiles", "label": "Clay/Concrete Tiles", "efficiency": 0.85, "description": "Good quality, traditional"},
    {"value": "Metal", "label": "Metal Sheets (GI/Aluminum)", "efficiency": 0.8, "description": "Durable, moderate quality"},
    {"value": "Asbestos", "label": "Asbestos Sheets", "efficiency": 0.7, "description": "Requires extra filtration"},
]
PROJECT_STATUS = [
    {"value": "planning", "label": "Planning Phase", "icon": "plan"},
    {"value": "approved", "label": "Approved/Funded", "icon": "approved"},
    {"value": "in_progress", "label": "Under Construction", "icon": "progress"},
    {"value": "completed", "label": "Completed", "icon": "complete"},
]
BUDGET_RANGES = [
    {"value": 25000, "label": "Rs 25,000 - Basic System"},
    {"value": 50000, "label": "Rs 50,000 - Standard System"},
    {"value": 75000, "label": "Rs 75,000 - Enhanced System"},
    {"value": 100000, "label": "Rs 1,00,000 - Premium System"},
    {"value": 150000, "label": "Rs 1,50,000+ - Advanced System"},
]


class AssessmentInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    state: str = Field(..., min_length=2, max_length=80)
    district: str = Field(..., min_length=2, max_length=80)
    pincode: str = Field(..., pattern=r"^\d{6}$", description="6-digit pincode")
    n_members: int = Field(..., ge=1, le=200)
    catchment_area: float = Field(..., ge=1, le=100000, description="Roof catchment area, sq m")
    farm_land_area: Optional[float] = Field(0, ge=0, le=100000, description="Farm land, acres")
    roof_type: str = Field(..., description="Flat | Sloped | Mixed")
    roof_material: str = Field(..., description="RCC | Tiles | Metal | Asbestos")
    budget: float = Field(..., ge=0, le=100_000_000)
    project_status: Optional[str] = "planning"


class AssessmentOutput(BaseModel):
    user_details: Dict[str, Any]
    location_data: Dict[str, Any]
    rwh_analysis: Dict[str, Any]
    cost_analysis: Dict[str, Any]
    implementation: Dict[str, Any]
    feasibility: Dict[str, Any]
    recommendations: List[str]
    climate: Dict[str, Any]
    assessment_id: str
    timestamp: str
    ai_enhanced: bool


# ------------------------------------------------------------------ helpers
def design_tank(capacity_l: float) -> Dict[str, float]:
    """Cylinder inside the construction limits (0.9-2.0 m diameter, 0.95-3.0 m height)."""
    capacity_m3 = max(capacity_l, 200) / 1000
    diameter = min(max(0.9, math.sqrt(capacity_m3 / 1.5)), 2.0)
    height = min(max(0.95, capacity_m3 / (math.pi * (diameter / 2) ** 2)), 3.0)
    return {"height_meters": round(height, 2), "diameter_meters": round(diameter, 2),
            "capacity_liters": round(math.pi * (diameter / 2) ** 2 * height * 1000)}


def rule_based_design(data: AssessmentInput, tank_l: float, climate: Dict[str, Any]) -> Dict[str, Any]:
    flood_high = climate["scores"]["flood"]["score"] >= 50
    if data.roof_material in ("Asbestos", "Thatch"):
        system, placement, why = "pit_recharge", "underground", "Asbestos/thatch roofs cannot carry a rooftop tank"
    elif (data.farm_land_area or 0) > 0:
        system, placement, why = "rooftop_with_recharge", "ground", "Farm land available: store for use and recharge the surplus"
    elif flood_high:
        system, placement, why = "rooftop_with_recharge", "ground", "High monsoon flood risk: store what you need and route overflow to a recharge pit"
    else:
        system, placement = "rooftop_collection", "ground" if data.budget < 15000 else "elevated"
        why = "Rooftop collection fits your roof, budget and rainfall"
    tank = design_tank(min(tank_l, 3000))
    tank.update({"shape": "cylindrical", "material_recommended": "Plastic" if data.budget < 15000 else "Ferro-cement",
                 "placement": placement})
    return {
        "recommended_system_type": system, "system_type_reason": why,
        "alternative_systems": ["open_area_collection", "pit_recharge"], "tank_dimensions": tank,
        "dimension_reasoning": "Sized from household demand and the local dry spell, within construction limits",
        "structural_notes": f"Roof material ({data.roof_material}) considered for placement",
        "installation_type": "underground" if placement == "underground" else "above_ground",
        "additional_components": ["first_flush_diverter", "mesh_filter"] + (["overflow_to_recharge_pit"] if flood_high else []),
        "geography_suitable": "Rule-based design; confirm with a local engineer",
    }


def sanitize_design(design: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
    """Accept an LLM design only if its tank respects the physical limits; otherwise repair it."""
    try:
        tank = design["tank_dimensions"]
        h, d = float(tank["height_meters"]), float(tank["diameter_meters"])
        h, d = min(max(h, 0.95), 3.0), min(max(d, 0.9), 2.0)
        tank.update({"height_meters": round(h, 2), "diameter_meters": round(d, 2),
                     "capacity_liters": round(math.pi * (d / 2) ** 2 * h * 1000)})
        if not design.get("recommended_system_type"):
            raise KeyError("recommended_system_type")
        return design
    except (KeyError, TypeError, ValueError):
        return fallback


def valid_plan(plan: Dict[str, Any]) -> bool:
    return isinstance(plan.get("phases"), list) and len(plan["phases"]) >= 3 and "total_duration_days" in plan


def finish_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    start = datetime.now()
    days = int(plan.get("total_duration_days") or 21)
    plan.setdefault("estimated_start_date", start.strftime("%Y-%m-%d"))
    plan.setdefault("estimated_completion_date", (start + timedelta(days=days)).strftime("%Y-%m-%d"))
    cursor = 0
    for phase in plan["phases"]:
        duration = int(phase.get("duration_days") or 3)
        phase.setdefault("start_day", cursor)
        phase.setdefault("end_day", cursor + duration)
        cursor = phase["end_day"]
    return plan


def baseline_recommendations(data: AssessmentInput, loc: Dict[str, Any], cost: Dict[str, Any],
                             climate: Dict[str, Any], balance: Dict[str, Any]) -> List[str]:
    recs: List[str] = []
    gap = cost["total_estimated_cost"] - data.budget
    if gap > 0:
        recs.append(f"Budget gap of Rs {gap:,.0f}: phase the build (gutters and first flush first) or check Jal Shakti Abhiyan and state subsidies.")
    else:
        recs.append(f"Budget covers the estimate with Rs {-gap:,.0f} to spare: invest it in better filtration or a larger tank.")
    rain = loc["total_annual_rainfall"]
    if rain < 600:
        recs.append("Low-rainfall district: every litre counts. Keep gutters at a 1:100 slope with sealed joints, and cover the tank.")
    elif rain > 1500:
        recs.append("High-rainfall district: pair storage with a recharge pit so monsoon surplus soaks into the ground instead of the street.")
    else:
        recs.append(f"Moderate rainfall ({rain:.0f} mm/year) suits a standard rooftop system.")
    scores = climate["scores"]
    if scores["flood"]["score"] >= 50:
        recs.append(f"Flood risk is {scores['flood']['level']}: route tank overflow to a recharge pit, keep the first-flush chamber clear before the rains, and raise the pump above ground level.")
    if scores["drought"]["score"] >= 50:
        recs.append(f"Dry-season scarcity risk is {scores['drought']['level']}: size storage for roughly {balance['assumptions']['dry_spell_days_estimated']} dry days ({balance['recommended_tank_l']:,} L suggested).")
    if scores["heat"]["score"] >= 55:
        recs.append("Summer heat raises household use by about a third: keep the tank shaded and covered, and reserve a drinking-water buffer.")
    if loc["groundwater_extraction_stage"] > 70:
        recs.append(f"Groundwater here is stressed ({loc['groundwater_extraction_stage']:.0f}% of annual recharge extracted, state-level survey): recharge matters as much as storage.")
    return recs


# ------------------------------------------------------------------ endpoints
@router.post("/analyze", response_model=AssessmentOutput)
async def analyze(data: AssessmentInput) -> AssessmentOutput:
    gis = gis_manager.get_location_data(pincode=data.pincode, district=data.district, state=data.state)
    if not gis:
        raise AppError(404, f"No location data for pincode {data.pincode}. Check the pincode or district.")
    record = gis["record"]
    rain, gw = gis["rainfall"], gis["groundwater"]
    total_rain, gw_stage = round(rain["total_annual"], 1), round(gw["extraction_percentage"], 1)

    location_data = {
        "latitude": gis["latitude"], "longitude": gis["longitude"], "district": gis["district"], "state": gis["state"],
        "pincode": data.pincode, "total_annual_rainfall": total_rain, "monsoon_rainfall": round(rain["monsoon"], 1),
        "post_monsoon_rainfall": round(rain["post_monsoon"], 1), "groundwater_extraction_stage": gw_stage,
        "groundwater_resource": round(gw["resource_bcm"], 3), "groundwater_scope": gw["scope"],
        "water_stress": gis_manager.get_water_stress_level(gis), "data_confidence": gis["confidence"],
        "rainfall_source": gis["rainfall_source"], "match_type": gis["match_type"],
    }

    forecast = await asyncio.to_thread(fetch_forecast, gis["latitude"], gis["longitude"]) if get_settings().forecast_enabled else None
    climate = assess_risk(record, forecast).to_dict()

    runoff = RUNOFF_COEFFICIENTS.get(data.roof_material, 0.80)
    balance = water_balance(record, data.catchment_area, data.n_members, runoff, heat=climate["scores"]["heat"])
    daily = balance["household_daily_demand_l"]

    # Deterministic engines own the numbers.
    cost = RWHCostPredictor().predict_cost(
        catchment_area=data.catchment_area, storage_capacity=balance["recommended_tank_l"], roof_type=data.roof_type,
        roof_material=data.roof_material, location_data=location_data, user_budget=data.budget, n_members=data.n_members)
    feasibility = FeasibilityAnalyzer().calculate_feasibility(data, location_data, cost)
    design = rule_based_design(data, balance["recommended_tank_l"] or 1000, climate)
    implementation = fallback_plan(feasibility["overall_score"], feasibility["category"])
    recommendations = baseline_recommendations(data, location_data, cost, climate, balance)

    # LLM enrichment, in parallel; every piece is optional.
    ai = get_ai()
    ai_enhanced = False
    if ai.llm.available:
        hazards = ", ".join(f"{k} {v['level']} ({v['score']:.0f}/100)" for k, v in climate["scores"].items())
        base_ctx = {"district": gis["district"], "state": gis["state"], "catchment_area": data.catchment_area,
                    "roof_type": data.roof_type, "roof_material": data.roof_material, "budget": data.budget,
                    "n_members": data.n_members, "rainfall": total_rain, "gw_extraction": gw_stage,
                    "farm_land_area": data.farm_land_area or 0, "gw_status": location_data["water_stress"],
                    "feasibility_score": feasibility["overall_score"], "hazards": hazards}
        place = f"{gis['district']} {gis['state']}"
        design_r, plan_r, recs_r = await asyncio.gather(
            ai.generate_json("system_design", base_ctx, f"rainwater harvesting system design {place} {data.roof_material}"),
            ai.generate_json("implementation_plan", base_ctx, f"rainwater harvesting implementation {place}"),
            ai.generate_json("recommendations", base_ctx, f"rainwater harvesting recommendations {place} flood drought"),
            return_exceptions=True)
        if isinstance(design_r, dict):
            design, ai_enhanced = sanitize_design(design_r, design), True
        if isinstance(plan_r, dict) and valid_plan(plan_r):
            implementation, ai_enhanced = plan_r, True
        if isinstance(recs_r, dict):
            for item in (recs_r.get("recommendations") or [])[:4]:
                if isinstance(item, dict) and item.get("title"):
                    recommendations.append(f"AI Insight: {item['title']} - {item.get('description', '')}".strip(" -"))
                    ai_enhanced = True
            for failure in (design_r, plan_r, recs_r):
                if isinstance(failure, Exception) and not isinstance(failure, AIUnavailable):
                    log.warning("AI enrichment error: %r", failure)
    implementation = finish_plan(implementation)

    tank = design["tank_dimensions"]
    return AssessmentOutput(
        user_details={"name": data.name, "location": f"{data.district}, {data.state}", "pincode": data.pincode,
                      "household_members": data.n_members, "catchment_area_sqm": data.catchment_area,
                      "farm_land_acres": data.farm_land_area or 0, "budget_inr": data.budget},
        location_data=location_data,
        rwh_analysis={
            "rwh_type": design["recommended_system_type"].replace("_", " ").title(),
            "rwh_type_code": design["recommended_system_type"],
            "system_type_reason": design.get("system_type_reason", ""),
            "alternative_systems": design.get("alternative_systems", []),
            "tank_dimensions": tank,
            "dimension_reasoning": design.get("dimension_reasoning", ""),
            "structural_notes": design.get("structural_notes", ""),
            "installation_type": design.get("installation_type", "above_ground"),
            "additional_components": design.get("additional_components", []),
            "geography_suitable": design.get("geography_suitable", ""),
            "recommended_storage_capacity_liters": tank.get("capacity_liters", balance["recommended_tank_l"]),
            "annual_harvestable_water_liters": balance["annual_harvest_l"],
            "monsoon_harvest_liters": balance["monsoon_harvest_l"],
            "kept_off_the_street_liters": balance["kept_off_the_street_l"],
            "daily_household_requirement_liters": daily,
            "hot_day_requirement_liters": balance["hot_day_demand_l"],
            "water_self_sufficiency_days": balance["self_sufficiency_days"],
            "recharge_pit_recommended": balance["recharge_pit_recommended"],
            "runoff_coefficient": runoff,
        },
        cost_analysis=cost, implementation=implementation, feasibility=feasibility,
        recommendations=recommendations, climate=climate,
        assessment_id=f"INDRA-{data.pincode}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        timestamp=datetime.now().isoformat(), ai_enhanced=ai_enhanced,
    )


@router.get("/master-data")
async def master_data() -> Dict[str, Any]:
    return {"states": sorted(INDIAN_STATES), "roof_types": ROOF_TYPES, "roof_materials": ROOF_MATERIALS,
            "project_status": PROJECT_STATUS, "budget_ranges": BUDGET_RANGES}
