"""Prompt templates for structured (JSON) generation. Each builder returns the full prompt string."""

from __future__ import annotations

import json
from typing import Any, Callable, Dict

JSON_ONLY = "Return ONLY valid JSON."


def _kb(rag: str) -> str:
    return f"KNOWLEDGE BASE CONTEXT:\n{rag or 'Use your knowledge about Indian conditions.'}\n\n"


def implementation_plan(c: Dict[str, Any], rag: str) -> str:
    return _kb(rag) + f"""Generate a detailed RWH implementation plan.

PROJECT DETAILS:
- Location: {c.get('district')}, {c.get('state')}
- Catchment Area: {c.get('catchment_area')} sq m
- Roof Type: {c.get('roof_type')}
- Budget: Rs {c.get('budget')}
- Feasibility: {c.get('feasibility_score')}/100
- Climate hazards here: {c.get('hazards', 'not assessed')}

GEOGRAPHY CONSIDERATIONS:
- Consider terrain of {c.get('state')} (hilly/plains/coastal/desert)
- Account for local monsoon patterns and flood / dry-season risk
- Factor in soil type for recharge pits

Generate JSON with:
{{
    "total_duration_days": <number>,
    "best_season_to_start": "<season based on local monsoon>",
    "geography_considerations": "<specific to this region>",
    "phases": [
        {{"phase_name": "<name>", "duration_days": <num>, "tasks": ["<task>"], "priority": "high/medium/low", "geography_note": "<local consideration>"}}
    ],
    "milestones": ["<milestone>"],
    "risk_factors": ["<risk>"],
    "local_resources": "<materials/labor notes>"
}}

{JSON_ONLY}"""


def recommendations(c: Dict[str, Any], rag: str) -> str:
    return _kb(rag) + f"""Generate specific RWH recommendations.

LOCATION: {c.get('district')}, {c.get('state')}
RAINFALL: {c.get('rainfall')} mm/year
GROUNDWATER: {c.get('gw_status')}
BUDGET: Rs {c.get('budget')}
ROOF: {c.get('roof_type')} - {c.get('roof_material')}
CLIMATE HAZARDS: {c.get('hazards', 'not assessed')}

Consider:
1. Geography of {c.get('state')} (terrain, soil, climate)
2. Local traditional RWH methods
3. Government schemes available in this state
4. Cost-effective solutions for this budget
5. Surviving both monsoon flooding and dry-season scarcity

Generate JSON:
{{
    "recommendations": [
        {{"title": "<short title>", "description": "<2-3 sentences>", "priority": "high/medium/low", "cost_impact": "<low/medium/high>"}}
    ],
    "local_insights": "<region-specific advice>",
    "government_schemes": ["<available schemes in {c.get('state')}>"]
}}

{JSON_ONLY}"""


def water_distribution(c: Dict[str, Any], rag: str) -> str:
    return _kb(rag) + f"""Calculate optimal water distribution for rural farming.

FARM DETAILS:
- Location: {c.get('location')}
- Season: {c.get('season')}
- Cattle: {c.get('cattle_count')}
- Family: {c.get('household_members')} members
- Farm Size: {c.get('farm_size_acres')} acres
- Crop: {c.get('crop_type', 'General')}

CLIMATE DATA:
- Annual Rainfall: {c.get('annual_rainfall')} mm
- Season Rainfall: {c.get('season_rainfall')} mm
- Water Stress: {c.get('water_stress')}

Generate water distribution in buckets (1 bucket = 20L):
{{
    "irrigation_buckets": <number>,
    "cattle_buckets": <number>,
    "drinking_buckets": <number>,
    "total_daily_buckets": <number>,
    "water_status": "<Critical/Moderate/Sufficient/Surplus>",
    "recommendations": ["<3 specific tips>"],
    "ai_insights": "<50 word analysis of water situation>",
    "seasonal_adjustments": "<how to adjust for this season>"
}}

{JSON_ONLY}"""


def cost_analysis(c: Dict[str, Any], rag: str) -> str:
    return _kb(rag) + f"""Generate detailed RWH cost analysis.

PROJECT DETAILS:
- Location: {c.get('district')}, {c.get('state')}
- Catchment: {c.get('catchment_area')} sq m
- Roof: {c.get('roof_type')} - {c.get('roof_material')}
- Budget: Rs {c.get('budget')}
- Household: {c.get('n_members')} members
- Rainfall: {c.get('rainfall')} mm/year

Consider local material costs in {c.get('state')}.

Generate JSON:
{{
    "storage_tank": <cost in INR>,
    "filtration_system": <cost>,
    "first_flush_diverter": <cost>,
    "piping_and_fittings": <cost>,
    "gutters_and_channels": <cost>,
    "labor_charges": <cost>,
    "total_estimated_cost": <total>,
    "annual_maintenance": <cost>,
    "recommended_storage_liters": <liters>,
    "budget_tier": "<Ultra Budget/Budget/Standard/Premium>",
    "cost_optimization_tips": ["<tips to reduce cost>"],
    "roi_estimate_years": <payback period>
}}

{JSON_ONLY}"""


def feasibility(c: Dict[str, Any], rag: str) -> str:
    return _kb(rag) + f"""Analyze RWH feasibility for this location.

DETAILS:
- Location: {c.get('district')}, {c.get('state')}
- Rainfall: {c.get('rainfall')} mm/year
- Groundwater: {c.get('gw_extraction')}% extraction
- Catchment: {c.get('catchment_area')} sq m
- Members: {c.get('n_members')}
- Budget: Rs {c.get('budget')}
- Roof: {c.get('roof_type')}

Analyze feasibility considering geography of {c.get('state')}.

Generate JSON:
{{
    "overall_score": <0-100>,
    "category": "<Highly Feasible/Feasible/Moderately Feasible/Challenging/Difficult>",
    "factor_scores": {{
        "rainfall_adequacy": <0-100>,
        "budget_sufficiency": <0-100>,
        "catchment_efficiency": <0-100>,
        "groundwater_need": <0-100>,
        "implementation_complexity": <0-100>
    }},
    "strengths": ["<top 3 strengths>"],
    "challenges": ["<top 3 challenges>"],
    "recommendation": "<overall recommendation based on analysis>",
    "geography_factors": "<how local geography affects feasibility>"
}}

{JSON_ONLY}"""


SYSTEM_TYPES = """1. "rooftop_collection": Collects rain from rooftop via gutters into storage tank
2. "open_area_collection": Collects from open courtyards, driveways, pavements
3. "pit_recharge": Recharge pit for groundwater replenishment
4. "paved_surface": Collects from hard surfaces (driveways, courtyards)
5. "farm_pond": Agricultural water storage for irrigation
6. "percolation_tank": Large scale groundwater recharge
7. "rooftop_with_recharge": Hybrid - rooftop collection + groundwater recharge
8. "contour_bunding": Slope management for runoff collection (hilly areas)
9. "check_dam": Stream/nala-based collection (community scale)"""


def system_design(c: Dict[str, Any], rag: str) -> str:
    return _kb(rag) + f"""Design the optimal RWH system for this property.

PROPERTY DETAILS:
- Location: {c.get('district')}, {c.get('state')}
- Catchment Area: {c.get('catchment_area')} sq m
- Roof Type: {c.get('roof_type')}
- Roof Material: {c.get('roof_material')}
- Household Members: {c.get('n_members')}
- Budget: Rs {c.get('budget')}
- Rainfall: {c.get('rainfall')} mm/year
- Groundwater Status: {c.get('gw_extraction')}% extraction
- Farm Land: {c.get('farm_land_area', 0)} acres
- Climate hazards: {c.get('hazards', 'not assessed')}

STRUCTURAL CONSTRAINTS:
- Asbestos/Thatch roofs CANNOT support rooftop tanks (use ground/pit based)
- Metal roofs have limited load capacity
- RCC/Concrete roofs can support rooftop tanks

TANK DIMENSION CONSTRAINTS:
- Height: 0.95m (minimum) to 3.0m (maximum)
- Diameter: 0.9m (minimum) to 2.0m (maximum)
- Capacity formula: pi x (diameter/2)^2 x height x 1000 liters

RWH SYSTEM TYPES (choose the most appropriate):
{SYSTEM_TYPES}

DECISION LOGIC:
- If roof is Asbestos/Thatch -> recommend ground-based or pit systems
- If farm land > 0 -> consider farm_pond or hybrid system
- If groundwater extraction > 70% -> prioritize recharge systems
- If rainfall < 500mm -> maximize storage efficiency
- If budget < 10000 -> simple rooftop or pit system
- If flood risk is high -> include an overflow route to a recharge pit

Generate JSON with EXACT format:
{{
    "recommended_system_type": "<one of the system types above>",
    "system_type_reason": "<why this system type is best for these conditions>",
    "alternative_systems": ["<alternative 1>", "<alternative 2>"],
    "tank_dimensions": {{
        "height_meters": <number between 0.95 and 3.0>,
        "diameter_meters": <number between 0.9 and 2.0>,
        "capacity_liters": <calculated capacity>,
        "shape": "<cylindrical/rectangular>",
        "material_recommended": "<Plastic/Ferro-cement/Brick/RCC>",
        "placement": "<rooftop/ground/underground>"
    }},
    "dimension_reasoning": "<why these dimensions - consider members, rainfall, budget>",
    "structural_notes": "<any structural considerations based on roof material>",
    "installation_type": "<above_ground/underground/elevated>",
    "additional_components": ["<component 1>", "<component 2>"],
    "geography_suitable": "<how system suits local geography>"
}}

{JSON_ONLY}"""


BUILDERS: Dict[str, Callable[[Dict[str, Any], str], str]] = {
    "implementation_plan": implementation_plan,
    "recommendations": recommendations,
    "water_distribution": water_distribution,
    "cost_analysis": cost_analysis,
    "feasibility": feasibility,
    "system_design": system_design,
}


def build(content_type: str, context: Dict[str, Any], rag: str) -> str:
    builder = BUILDERS.get(content_type)
    if builder:
        return builder(context, rag)
    return _kb(rag) + f"Generate relevant content for: {content_type}\nContext: {json.dumps(context, default=str)}\n" \
                      "Return structured JSON response."
