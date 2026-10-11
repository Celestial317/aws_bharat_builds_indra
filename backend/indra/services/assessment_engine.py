"""Deterministic assessment engines: RWH cost model, feasibility scoring and a baseline plan.

These own the numbers. The LLM (see ``indra.ai``) only enriches them with narrative; when the LLM is
unavailable the API still returns complete, consistent results from here.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np


class RWHCostPredictor:
    """
    ML-based cost prediction using statistical models and domain knowledge
    Budget-aware planning: Adapts system to fit within user's budget
    
    REALISTIC COST REFERENCE (India 2024):
    - Ultra-Budget System: ₹3,000 - ₹5,000 (DIY, minimal)
    - Budget System: ₹5,000 - ₹10,000 (basic setup)
    - Standard RWH System: ₹10,000 - ₹20,000 (recommended)
    - Premium System: ₹20,000+ (advanced features)
    """
    
    # Component costs with budget tiers (INR) - BASE COSTS
    COMPONENT_COSTS = {
        "ultra_budget": {  # ₹3,000 - ₹5,000
            "storage_tank": 1500,  # Small plastic drum (200L)
            "filtration_system": 500,  # DIY sand-gravel
            "first_flush_diverter": 300,  # Simple PVC
            "piping_and_fittings": 200,
            "gutters_and_channels": 300,  # Partial gutters
            "labor_charges": 500,  # Mostly DIY
        },
        "budget": {  # ₹5,000 - ₹10,000
            "storage_tank": 3000,  # 500L tank
            "filtration_system": 1000,
            "first_flush_diverter": 500,
            "piping_and_fittings": 300,
            "gutters_and_channels": 800,
            "labor_charges": 2000,
        },
        "standard": {  # ₹10,000 - ₹20,000
            "storage_tank": 6000,  # 1000L tank
            "filtration_system": 1500,
            "first_flush_diverter": 800,
            "piping_and_fittings": 500,
            "gutters_and_channels": 2000,
            "labor_charges": 4000,
        },
        "premium": {  # ₹20,000+
            "storage_tank": 12000,  # 2000L+ tank
            "filtration_system": 3000,
            "first_flush_diverter": 1200,
            "piping_and_fittings": 800,
            "gutters_and_channels": 3500,
            "labor_charges": 6000,
        }
    }
    
    # Material multipliers - affects filtration and water quality
    MATERIAL_MULTIPLIERS = {
        "RCC": 1.0,      # Ideal - minimal filtration needed
        "Tiles": 0.95,   # Good - slightly less efficient
        "Metal": 1.15,   # Needs more filtration, can rust
        "Asbestos": 1.25, # Needs extra filtration (health concern)
        "Thatch": 1.3,   # Rural - needs significant filtration
        "other": 1.1
    }
    
    # Roof type multipliers - affects installation complexity
    ROOF_TYPE_MULTIPLIERS = {
        "Flat": 1.0,     # Easiest - simple drainage
        "Sloped": 1.15,  # Moderate - needs proper gutters
        "Mixed": 1.25,   # Complex - multiple collection points
        "Dome": 1.3,     # Difficult - specialized collection
        "other": 1.1
    }
    
    # Household size affects required storage capacity
    HOUSEHOLD_SIZE_MULTIPLIERS = {
        1: 0.5,   # Single person
        2: 0.7,   # Couple
        3: 0.85,  # Small family
        4: 1.0,   # Average family (baseline)
        5: 1.15,  # Large family
        6: 1.3,   # Joint family
        7: 1.4,
        8: 1.5,
    }
    
    # Rainfall zone affects storage sizing
    RAINFALL_ZONE_MULTIPLIERS = {
        "very_high": 0.8,   # >2000mm - smaller storage ok (frequent refill)
        "high": 0.9,        # 1200-2000mm
        "moderate": 1.0,    # 700-1200mm (baseline)
        "low": 1.2,         # 400-700mm - larger storage needed
        "very_low": 1.4,    # <400mm - maximize storage
    }
    
    def _get_rainfall_zone(self, annual_rainfall: float) -> str:
        """Categorize rainfall zone"""
        if annual_rainfall >= 2000:
            return "very_high"
        elif annual_rainfall >= 1200:
            return "high"
        elif annual_rainfall >= 700:
            return "moderate"
        elif annual_rainfall >= 400:
            return "low"
        else:
            return "very_low"
    
    def _select_budget_tier(self, budget: float) -> str:
        """Select appropriate cost tier based on user's budget"""
        if budget < 5000:
            return "ultra_budget"
        elif budget < 10000:
            return "budget"
        elif budget < 20000:
            return "standard"
        else:
            return "premium"
    
    def predict_cost(self, catchment_area: float, storage_capacity: float, 
                    roof_type: str, roof_material: str, location_data: Dict,
                    user_budget: float = 20000, n_members: int = 4) -> Dict[str, Any]:
        """
        Predict RWH system cost - FULLY DYNAMIC
        Considers: budget, roof type, roof material, area, members, rainfall
        """
        
        # Select budget tier
        tier = self._select_budget_tier(user_budget)
        base_costs = self.COMPONENT_COSTS[tier].copy()
        
        # Get multipliers based on all input factors
        mat_mult = self.MATERIAL_MULTIPLIERS.get(roof_material, 1.0)
        roof_mult = self.ROOF_TYPE_MULTIPLIERS.get(roof_type, 1.0)
        
        # Household size multiplier (cap at 8+)
        hh_mult = self.HOUSEHOLD_SIZE_MULTIPLIERS.get(min(n_members, 8), 1.0 + (n_members - 4) * 0.15)
        
        # Rainfall zone multiplier
        annual_rainfall = location_data.get('total_annual_rainfall', 800)
        rainfall_zone = self._get_rainfall_zone(annual_rainfall)
        rain_mult = self.RAINFALL_ZONE_MULTIPLIERS.get(rainfall_zone, 1.0)
        
        # Area factor (catchment area affects gutter length and piping)
        # 100 sq m is baseline (typical small house)
        area_factor = min(max(catchment_area / 100, 0.7), 2.5)
        
        # Groundwater stress affects investment value
        gw_stress = location_data.get('groundwater_extraction_stage', 50)
        urgency_mult = 1.0 + (gw_stress / 200)  # Up to 1.5x for critical areas
        
        
        # Calculate component costs with all factors
        breakdown = {}
        
        # Storage tank - scales with household size and rainfall zone
        tank_cost = base_costs["storage_tank"] * hh_mult * rain_mult
        breakdown["storage_tank"] = round(tank_cost, 0)
        
        # Filtration - scales with roof material (some need more filtering)
        filter_cost = base_costs["filtration_system"] * mat_mult
        breakdown["filtration_system"] = round(filter_cost, 0)
        
        # First flush - relatively fixed, slight area adjustment
        ff_cost = base_costs["first_flush_diverter"] * min(area_factor, 1.3)
        breakdown["first_flush_diverter"] = round(ff_cost, 0)
        
        # Piping - scales with area and roof complexity
        pipe_cost = base_costs["piping_and_fittings"] * area_factor * roof_mult
        breakdown["piping_and_fittings"] = round(pipe_cost, 0)
        
        # Gutters - directly proportional to catchment perimeter (sqrt of area)
        gutter_factor = (catchment_area ** 0.5) / 10  # 100sqm = factor 1
        gutter_cost = base_costs["gutters_and_channels"] * max(gutter_factor, 0.8) * roof_mult
        breakdown["gutters_and_channels"] = round(gutter_cost, 0)
        
        # Labor - scales with complexity (roof type + area)
        labor_cost = base_costs["labor_charges"] * roof_mult * min(area_factor, 1.5)
        breakdown["labor_charges"] = round(labor_cost, 0)
        
        # Calculate total
        total_cost = sum(breakdown.values())
        
        # If over budget, scale proportionally to fit budget (with 5% buffer)
        if total_cost > user_budget and user_budget > 2000:
            scale_factor = (user_budget * 0.95) / total_cost
            for key in breakdown:
                breakdown[key] = round(breakdown[key] * scale_factor, 0)
            total_cost = sum(breakdown.values())
            tier = "budget_adapted"  # Mark as adapted
        
        # Annual maintenance (scales with system complexity)
        base_maintenance = {"ultra_budget": 500, "budget": 800, "standard": 1000, "premium": 1500, "budget_adapted": 600}
        annual_maintenance = round(base_maintenance.get(tier, 800) * roof_mult * mat_mult, 0)
        
        # Storage capacity estimation - dynamic based on factors
        base_capacity = {"ultra_budget": 200, "budget": 500, "standard": 1000, "premium": 2000, "budget_adapted": 300}
        practical_storage = round(base_capacity.get(tier, 500) * hh_mult * rain_mult, 0)
        
        breakdown["total_estimated_cost"] = round(total_cost, 0)
        breakdown["annual_maintenance"] = annual_maintenance
        breakdown["cost_per_liter_capacity"] = round(total_cost / max(practical_storage, 1), 2)
        breakdown["payback_estimate_years"] = round(total_cost / (practical_storage * 12 * 0.10), 1)
        breakdown["budget_tier"] = tier.replace("_", " ").title()
        breakdown["recommended_storage_liters"] = practical_storage
        breakdown["rainfall_zone"] = rainfall_zone.replace("_", " ").title()
        
        return breakdown


class FeasibilityAnalyzer:
    """AI-powered feasibility scoring system"""
    
    def __init__(self):
        self.weights = {
            "rainfall_adequacy": 0.25,
            "budget_sufficiency": 0.20,
            "catchment_efficiency": 0.15,
            "groundwater_need": 0.15,
            "household_size": 0.10,
            "implementation_complexity": 0.15
        }
    
    def calculate_feasibility(self, input_data: Any, 
                            location_data: Dict, cost_analysis: Dict) -> Dict[str, Any]:
        """
        Calculate comprehensive feasibility score (0-100)
        Uses multi-factor weighted scoring algorithm
        """
        
        scores = {}
        
        # 1. Rainfall Adequacy Score (0-100)
        rainfall = location_data.get('total_annual_rainfall', 0)
        if rainfall > 1500:
            scores['rainfall_adequacy'] = 100
        elif rainfall > 1000:
            scores['rainfall_adequacy'] = 80
        elif rainfall > 600:
            scores['rainfall_adequacy'] = 60
        elif rainfall > 300:
            scores['rainfall_adequacy'] = 40
        else:
            scores['rainfall_adequacy'] = 20
        
        # 2. Budget Sufficiency Score (0-100)
        # Now budget-aware: since we adapt the plan to budget, this is more lenient
        estimated_cost = cost_analysis.get('total_estimated_cost', 0)
        budget_tier = cost_analysis.get('budget_tier', 'Standard')
        
        # If system was adapted to fit budget, give higher score
        if estimated_cost <= input_data.budget:
            scores['budget_sufficiency'] = 90  # Plan fits budget
        elif input_data.budget >= estimated_cost * 0.9:
            scores['budget_sufficiency'] = 75
        elif input_data.budget >= estimated_cost * 0.7:
            scores['budget_sufficiency'] = 55
        else:
            scores['budget_sufficiency'] = 35  # Very tight budget
        
        # 3. Catchment Efficiency Score (0-100)
        # Assumes 1 sq m can support 2 people adequately
        catchment_per_person = input_data.catchment_area / input_data.n_members
        if catchment_per_person > 20:
            scores['catchment_efficiency'] = 100
        elif catchment_per_person > 10:
            scores['catchment_efficiency'] = 85
        elif catchment_per_person > 5:
            scores['catchment_efficiency'] = 70
        elif catchment_per_person > 2:
            scores['catchment_efficiency'] = 55
        else:
            scores['catchment_efficiency'] = 35
        
        # 4. Groundwater Need Score (0-100)
        gw_stage = location_data.get('groundwater_extraction_stage', 50)
        if gw_stage > 90:  # Critical
            scores['groundwater_need'] = 100
        elif gw_stage > 70:  # Over-exploited
            scores['groundwater_need'] = 85
        elif gw_stage > 50:  # Semi-critical
            scores['groundwater_need'] = 65
        else:
            scores['groundwater_need'] = 45
        
        # 5. Household Size Score (0-100)
        # Larger households benefit more from RWH
        if input_data.n_members >= 6:
            scores['household_size'] = 100
        elif input_data.n_members >= 4:
            scores['household_size'] = 80
        elif input_data.n_members >= 2:
            scores['household_size'] = 60
        else:
            scores['household_size'] = 40
        
        # 6. Implementation Complexity Score (0-100)
        # Lower complexity = higher score
        complexity_factors = 0
        if input_data.roof_type == "Mixed":
            complexity_factors += 1
        if input_data.roof_material in ["Asbestos", "other"]:
            complexity_factors += 1
        if input_data.catchment_area > 300:
            complexity_factors += 1
        
        if complexity_factors == 0:
            scores['implementation_complexity'] = 100
        elif complexity_factors == 1:
            scores['implementation_complexity'] = 75
        elif complexity_factors == 2:
            scores['implementation_complexity'] = 50
        else:
            scores['implementation_complexity'] = 30
        
        # Calculate weighted total
        total_score = sum(scores[key] * self.weights[key] for key in scores.keys())
        
        # Determine feasibility category
        if total_score >= 80:
            category = "Highly Feasible"
            recommendation = "Excellent conditions for RWH implementation. Proceed with confidence."
        elif total_score >= 65:
            category = "Feasible"
            recommendation = "Good conditions for RWH. Minor optimizations recommended."
        elif total_score >= 50:
            category = "Moderately Feasible"
            recommendation = "RWH is viable with careful planning and budget management."
        elif total_score >= 35:
            category = "Challenging"
            recommendation = "Consider phased implementation or budget increase."
        else:
            category = "Difficult"
            recommendation = "Significant challenges exist. Consider alternative water solutions or budget revision."
        
        return {
            "overall_score": round(total_score, 1),
            "category": category,
            "recommendation": recommendation,
            "factor_scores": {k: round(v, 1) for k, v in scores.items()},
            "strengths": self._identify_strengths(scores),
            "challenges": self._identify_challenges(scores)
        }
    
    def _identify_strengths(self, scores: Dict[str, float]) -> List[str]:
        """Identify top performing factors"""
        strengths = []
        for key, value in scores.items():
            if value >= 75:
                strengths.append(key.replace('_', ' ').title())
        return strengths[:3]  # Top 3
    
    def _identify_challenges(self, scores: Dict[str, float]) -> List[str]:
        """Identify weak factors needing attention"""
        challenges = []
        for key, value in scores.items():
            if value < 60:
                challenges.append(key.replace('_', ' ').title())
        return challenges[:3]  # Top 3




def fallback_plan(feasibility_score: float, category: str) -> Dict[str, Any]:
    """Fallback implementation plan when LLM is unavailable"""
    base_duration_days = 21

    if feasibility_score < 50:
        duration_days = base_duration_days + 7
    elif feasibility_score > 80:
        duration_days = base_duration_days - 3
    else:
        duration_days = base_duration_days

    if category in ["Challenging", "Difficult"]:
        duration_days += 5

    start_date = datetime.now()

    return {
        "total_duration_days": duration_days,
        "estimated_start_date": start_date.strftime("%Y-%m-%d"),
        "estimated_completion_date": (start_date + timedelta(days=duration_days)).strftime("%Y-%m-%d"),
        "best_season_to_start": "Pre-monsoon (March-May)",
        "geography_considerations": "General implementation - consult local experts for region-specific advice",
        "phases": [
            {
                "phase_name": "Site Assessment and Preparation",
                "start_day": 0, "end_day": 5, "duration_days": 5,
                "tasks": ["Site survey", "Soil test", "Design drawings", "Permissions"],
                "priority": "high",
                "geography_note": "Assess local terrain and drainage patterns"
            },
            {
                "phase_name": "Material Procurement",
                "start_day": 5, "end_day": 8, "duration_days": 3,
                "tasks": ["Procure tank", "Buy filters", "Get pipes and fittings", "Arrange gutters"],
                "priority": "high",
                "geography_note": "Source locally where possible"
            },
            {
                "phase_name": "Gutter Installation",
                "start_day": 8, "end_day": 12, "duration_days": 4,
                "tasks": ["Install gutters", "Mount downspouts", "Seal joints", "Test flow"],
                "priority": "high",
                "geography_note": "Account for local rainfall intensity"
            },
            {
                "phase_name": "Filtration Setup",
                "start_day": 12, "end_day": 15, "duration_days": 3,
                "tasks": ["Install first flush", "Set up filters", "Connect piping"],
                "priority": "medium",
                "geography_note": "Filter design based on local dust/debris levels"
            },
            {
                "phase_name": "Storage Installation",
                "start_day": 15, "end_day": 18, "duration_days": 3,
                "tasks": ["Prepare foundation", "Position tank", "Connect inlet/outlet"],
                "priority": "high",
                "geography_note": "Foundation depth based on soil type"
            },
            {
                "phase_name": "Testing and Commissioning",
                "start_day": 18, "end_day": 21, "duration_days": 3,
                "tasks": ["Full system test", "Check leaks", "Document settings"],
                "priority": "high",
                "geography_note": "Test before monsoon season"
            }
        ],
        "milestones": [
            "Week 1: Site preparation and material procurement",
            "Week 2: Installation of gutters, filters, and tanks",
            "Week 3: Testing and commissioning"
        ],
        "risk_factors": ["Weather delays", "Material availability", "Labor scheduling"],
        "local_resources": "Consult local RWH vendors for region-specific materials"
    }

