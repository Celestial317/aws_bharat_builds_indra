// Response of POST /api/assessment/analyze
import type { ClimateReport } from './climate';

export interface TankDimensions {
  height_meters: number;
  diameter_meters: number;
  capacity_liters: number;
  shape?: string;
  material_recommended?: string;
  placement?: string;
}

export interface AssessmentResult {
  assessment_id: string;
  timestamp: string;
  ai_enhanced: boolean;
  user_details: Record<string, string | number>;
  location_data: {
    latitude: number | null;
    longitude: number | null;
    district: string;
    state: string;
    pincode: string;
    total_annual_rainfall: number;
    monsoon_rainfall: number;
    groundwater_extraction_stage: number;
    water_stress: string;
    data_confidence: number;
    rainfall_source: string | null;
    match_type: string;
  };
  rwh_analysis: {
    rwh_type: string;
    rwh_type_code: string;
    system_type_reason?: string;
    alternative_systems?: string[];
    tank_dimensions?: TankDimensions;
    dimension_reasoning?: string;
    structural_notes?: string;
    installation_type?: string;
    additional_components?: string[];
    recommended_storage_capacity_liters: number;
    annual_harvestable_water_liters: number;
    monsoon_harvest_liters: number;
    kept_off_the_street_liters: number;
    daily_household_requirement_liters: number;
    hot_day_requirement_liters: number;
    water_self_sufficiency_days: number;
    recharge_pit_recommended: boolean;
    runoff_coefficient: number;
  };
  cost_analysis: {
    total_estimated_cost: number;
    annual_maintenance?: number;
    payback_estimate_years?: number;
    budget_tier?: string;
    recommended_storage_liters?: number;
  };
  implementation: {
    total_duration_days: number;
    phases: Array<{ phase_name: string; duration_days: number; tasks: string[] }>;
  };
  feasibility: {
    overall_score: number;
    category: string;
    recommendation?: string;
    factor_scores?: Record<string, number>;
    strengths?: string[];
    challenges?: string[];
  };
  recommendations: string[];
  climate: ClimateReport;
}
