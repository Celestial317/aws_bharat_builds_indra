// Shapes returned by /api/climate/*, /api/alerts/* and /api/tanks/*.

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe';
export type AlertLevel = 'info' | 'watch' | 'warning' | 'critical';
export type Hazard = 'flood' | 'drought' | 'heat';

export interface HazardScore {
  score: number;
  level: RiskLevel;
  drivers: string[];
  live_adjustment?: number;
  peak_tmax_c?: number;
  basis?: 'live_forecast' | 'climatological_estimate';
}

export interface ClimateAlert {
  type: Hazard;
  level: AlertLevel;
  title: string;
  detail: string;
  action: string;
  source?: string;
}

export interface ForecastDay {
  date: string;
  precip_mm: number;
  tmax_c: number | null;
  precip_prob: number | null;
}

export interface WaterBalance {
  assumptions: {
    runoff_coefficient: number;
    litres_per_person_per_day: number;
    design_storm_mm: number;
    dry_spell_days_estimated: number;
  };
  annual_harvest_l: number;
  monsoon_harvest_l: number;
  kept_off_the_street_l: number;
  first_hour_storm_runoff_l: number;
  household_daily_demand_l: number;
  hot_day_demand_l: number;
  self_sufficiency_days: number;
  recommended_tank_l: number;
  recharge_pit_recommended: boolean;
}

export interface ClimateReport {
  location: { state: string; district: string; latitude: number | null; longitude: number | null };
  scores: Record<Hazard, HazardScore>;
  overall: { score: number; level: RiskLevel; dominant: Hazard; swing_index: number; swing_note: string };
  season: { focus: Hazard; label: string; monsoon_name: string; monsoon_months: number[]; month: number };
  basis: Record<string, string>;
  alerts: ClimateAlert[];
  rainfall_mm: { monsoon: number; post_monsoon: number; summer: number; winter: number; annual: number };
  groundwater: { stage_pct: number | null; scope: string };
  match: { type: string; note?: string | null };
  forecast: {
    source: string;
    total_precip_mm: number;
    peak_daily_precip_mm: number;
    peak_tmax_c: number | null;
    rain_free_days: number;
    days: ForecastDay[];
  } | null;
  water_balance?: WaterBalance;
}

export interface Hotspot {
  district: string;
  state: string;
  flood: number;
  drought: number;
  heat: number;
  swing_index: number;
}

export interface FeedResponse {
  district: string;
  state: string;
  live: ClimateAlert[];
  stored: Array<ClimateAlert & { ts: string }>;
  store: string;
}

export type TankState = 'no_data' | 'ok' | 'low' | 'overflow_risk' | 'offline';

export interface Tank {
  id: string;
  name: string;
  ownerId: string;
  shared: boolean;
  capacityLiters: number;
  state: TankState;
  message?: string;
  fillPct?: number;
  trendLitersPerHour?: number | null;
  hoursToEmpty?: number | null;
  hoursToFull?: number | null;
  latest?: { ts: string; levelLiters: number; rainMm?: number };
  history?: Array<{ ts: string; levelLiters: number }>;
  deviceKey?: string;
}
