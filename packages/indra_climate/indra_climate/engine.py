"""Flood / drought / heat scoring, water balance and alert rules. Pure functions, no I/O.

Scores are 0-100 (higher = worse). Static scores come from the district climatology; when a live
:class:`~indra_climate.forecast.Forecast` is supplied it sharpens flood and heat scores.
Rainfall intensity classes follow IMD (heavy >= 64.5 mm, very heavy >= 115.6 mm, extremely heavy
>= 204.5 mm in 24 h).
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .forecast import Forecast

IMD_HEAVY, IMD_VERY_HEAVY, IMD_EXTREME = 64.5, 115.6, 204.5
LEVELS = ("low", "moderate", "high", "severe")
_SEVERITY = {"info": 0, "watch": 1, "warning": 2, "critical": 3}


def interp(x: float, points: Sequence[Tuple[float, float]]) -> float:
    """Piecewise-linear interpolation, clamped at both ends."""
    if x <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return points[-1][1]


def level_for(score: float) -> str:
    return LEVELS[0] if score < 25 else LEVELS[1] if score < 50 else LEVELS[2] if score < 75 else LEVELS[3]


@dataclass
class Alert:
    type: str          # flood | drought | heat
    level: str         # info | watch | warning | critical
    title: str
    detail: str
    action: str

    def to_dict(self) -> Dict[str, str]:
        return self.__dict__.copy()


@dataclass
class RiskReport:
    location: Dict[str, Any]
    scores: Dict[str, Dict[str, Any]]
    overall: Dict[str, Any]
    season: Dict[str, Any]
    basis: Dict[str, str] = field(default_factory=dict)
    alerts: List[Alert] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "location": self.location,
            "scores": self.scores,
            "overall": self.overall,
            "season": self.season,
            "basis": self.basis,
            "alerts": [a.to_dict() for a in self.alerts],
        }


# ------------------------------------------------------------------ helpers
def _rain(record: Dict[str, Any]) -> Dict[str, float]:
    r = record.get("rainfall", {})
    annual = float(r.get("annual") or r.get("total_annual") or 0.0)
    parts = {k: float(r.get(k) or 0.0) for k in ("monsoon", "post_monsoon", "summer", "winter")}
    if annual <= 0:
        annual = sum(parts.values())
    return {"annual": annual, **parts}


def _gw_stage(record: Dict[str, Any]) -> Optional[float]:
    gw = record.get("groundwater", {})
    stage = gw.get("stage_pct", gw.get("extraction_percentage"))
    return float(stage) if isinstance(stage, (int, float)) and stage >= 0 else None


def estimated_peak_tmax(record: Dict[str, Any]) -> float:
    """Typical April-May daily maximum (deg C) - an *estimate* from aridity and latitude."""
    annual = _rain(record)["annual"]
    lat = record.get("latitude")
    aridity = max(0.0, min(1.0, 1 - annual / 1500.0))
    lat_factor = 1 - min(abs((lat if lat is not None else 22.0) - 24.0), 12.0) / 12.0
    return round(34.5 + 7.5 * aridity + 1.5 * lat_factor, 1)


def monsoon_window(record: Dict[str, Any]) -> Tuple[str, List[int]]:
    """Main rainy months: Oct-Dec for north-east-monsoon regions (e.g. coastal Tamil Nadu), else Jun-Sep."""
    r = _rain(record)
    if r["post_monsoon"] > r["monsoon"]:
        return "north-east monsoon", [10, 11, 12]
    return "south-west monsoon", [6, 7, 8, 9]


def current_season(record: Dict[str, Any], today: Optional[_dt.date] = None) -> Dict[str, Any]:
    today = today or _dt.date.today()
    name, months = monsoon_window(record)
    if today.month in months:
        focus, label = "flood", f"{name.title()} - too much water"
    elif today.month in (3, 4, 5, 6) and today.month not in months:
        focus, label = "heat", "Pre-monsoon heat - the tap runs dry"
    else:
        focus, label = "drought", "Dry season - stretch your stored water"
    return {"focus": focus, "label": label, "monsoon_name": name, "monsoon_months": months, "month": today.month}


# ------------------------------------------------------------------ scoring
def flood_score(record: Dict[str, Any], forecast: Optional[Forecast] = None) -> Dict[str, Any]:
    r = _rain(record)
    wet_name, _ = monsoon_window(record)
    peak_mm = max(r["monsoon"], r["post_monsoon"])  # main rainy season, SW or NE monsoon
    base = interp(peak_mm, [(100, 5), (300, 20), (600, 35), (1000, 55), (1800, 75), (3000, 90), (6000, 100)])
    share = peak_mm / r["annual"] if r["annual"] else 0.0
    drivers = [f"{wet_name.title()} rainfall {peak_mm:.0f} mm", f"{share:.0%} of annual rain falls in the main rainy season"]
    if share > 0.8:
        base += 5
    live = 0.0
    if forecast and forecast.days:
        peak = forecast.peak_daily_precip_mm
        live = interp(peak, [(0, 0), (15.6, 0), (IMD_HEAVY, 15), (IMD_VERY_HEAVY, 30), (IMD_EXTREME, 45)])
        live += interp(forecast.total_precip_mm, [(0, 0), (100, 0), (250, 10), (500, 20)])
        drivers.append(f"Forecast: peak {peak:.0f} mm/day, {forecast.total_precip_mm:.0f} mm over {len(forecast.days)} days")
    score = round(min(100.0, base + live), 1)
    return {"score": score, "level": level_for(score), "static": round(min(100.0, base), 1),
            "live_adjustment": round(live, 1), "drivers": drivers}


def drought_score(record: Dict[str, Any], forecast: Optional[Forecast] = None) -> Dict[str, Any]:
    r = _rain(record)
    stage = _gw_stage(record)
    rain_part = interp(r["annual"], [(200, 95), (400, 80), (600, 60), (800, 45), (1200, 25), (2000, 10), (4000, 0)])
    drivers = [f"Annual rainfall {r['annual']:.0f} mm"]
    if stage is None:
        score = rain_part
        drivers.append("Groundwater stage unavailable - scored on rainfall alone")
    else:
        gw_part = interp(stage, [(0, 0), (40, 10), (70, 35), (90, 60), (100, 80), (150, 100)])
        score = 0.5 * rain_part + 0.5 * gw_part
        drivers.append(f"Groundwater extraction stage {stage:.0f}% of recharge")
    live = 0.0
    if forecast and forecast.days and forecast.rain_free_days == len(forecast.days):
        live = 5.0
        drivers.append(f"No meaningful rain forecast for {len(forecast.days)} days")
    score = round(min(100.0, score + live), 1)
    return {"score": score, "level": level_for(score), "live_adjustment": live, "drivers": drivers}


def heat_score(record: Dict[str, Any], forecast: Optional[Forecast] = None) -> Dict[str, Any]:
    live_peak = forecast.peak_tmax_c if forecast else None
    peak = live_peak if live_peak is not None else estimated_peak_tmax(record)
    score = round(interp(peak, [(28, 5), (35, 30), (40, 55), (43, 75), (45, 90), (48, 100)]), 1)
    basis = "live_forecast" if live_peak is not None else "climatological_estimate"
    label = "Forecast peak" if live_peak is not None else "Typical pre-monsoon peak (estimate)"
    return {"score": score, "level": level_for(score), "peak_tmax_c": round(peak, 1), "basis": basis,
            "drivers": [f"{label}: {peak:.0f} deg C"]}


def assess_risk(record: Dict[str, Any], forecast: Optional[Forecast] = None,
                today: Optional[_dt.date] = None) -> RiskReport:
    """Score all three hazards for one district record (see :mod:`indra_climate.atlas`)."""
    scores = {
        "flood": flood_score(record, forecast),
        "drought": drought_score(record, forecast),
        "heat": heat_score(record, forecast),
    }
    dominant = max(scores, key=lambda k: scores[k]["score"])
    overall_score = scores[dominant]["score"]
    # Water-system relevant blend: how hard the "flood and famine" swing is for this place.
    swing = round(min(scores["flood"]["score"], max(scores["drought"]["score"], scores["heat"]["score"])), 1)
    report = RiskReport(
        location={k: record.get(k) for k in ("state", "district", "latitude", "longitude")},
        scores=scores,
        overall={"score": overall_score, "level": level_for(overall_score), "dominant": dominant,
                 "swing_index": swing,
                 "swing_note": "High when a place suffers both monsoon flooding and dry-season scarcity."},
        season=current_season(record, today),
        basis={
            "rainfall": str(record.get("rainfall", {}).get("source", "unknown")),
            "groundwater_scope": str(record.get("groundwater", {}).get("scope", "unknown")),
            "heat": scores["heat"]["basis"],
            "forecast": forecast.source if forecast else "none",
        },
    )
    report.alerts = evaluate_alerts(record, forecast, scores)
    return report


# ------------------------------------------------------------------ alerts
def evaluate_alerts(record: Dict[str, Any], forecast: Optional[Forecast] = None,
                    scores: Optional[Dict[str, Dict[str, Any]]] = None) -> List[Alert]:
    """Turn forecast + structural climatology into prioritised, actionable alerts."""
    alerts: List[Alert] = []
    place = record.get("district") or "your area"

    if forecast and forecast.days:
        peak, total = forecast.peak_daily_precip_mm, forecast.total_precip_mm
        if peak >= IMD_EXTREME:
            alerts.append(Alert("flood", "critical", f"Extremely heavy rain forecast for {place}",
                                f"Up to {peak:.0f} mm in 24 h (IMD extremely heavy >= 204.5 mm).",
                                "Move to higher ground if the street floods; switch off the pump; "
                                "route tank overflow to the recharge pit."))
        elif peak >= IMD_VERY_HEAVY:
            alerts.append(Alert("flood", "warning", f"Very heavy rain forecast for {place}",
                                f"Up to {peak:.0f} mm in 24 h (IMD very heavy >= 115.6 mm).",
                                "Clear gutters and first-flush chamber now; keep the tank overflow open."))
        elif peak >= IMD_HEAVY:
            alerts.append(Alert("flood", "watch", f"Heavy rain forecast for {place}",
                                f"Up to {peak:.0f} mm in 24 h (IMD heavy >= 64.5 mm).",
                                "Inspect gutters and downspouts; empty the tank partly to absorb the storm."))
        elif total >= 250:
            alerts.append(Alert("flood", "watch", f"Wet week ahead for {place}",
                                f"{total:.0f} mm expected over {len(forecast.days)} days.",
                                "Keep drains clear and leave headroom in the storage tank."))

        tmax = forecast.peak_tmax_c
        if tmax is not None:
            if tmax >= 45:
                alerts.append(Alert("heat", "critical", f"Severe heatwave forecast for {place}", f"Peak {tmax:.0f} deg C.",
                                    "Budget at least 5 L drinking water per person per day; cover tanks; avoid midday work."))
            elif tmax >= 43:
                alerts.append(Alert("heat", "warning", f"Heatwave forecast for {place}", f"Peak {tmax:.0f} deg C.",
                                    "Raise stored drinking-water reserve; water crops at dawn or dusk only."))
            elif tmax >= 40:
                alerts.append(Alert("heat", "watch", f"Hot spell forecast for {place}", f"Peak {tmax:.0f} deg C.",
                                    "Expect 20-30% higher household water use; top up the tank beforehand."))

    stage = _gw_stage(record)
    if stage is not None and stage >= 100:
        alerts.append(Alert("drought", "warning", f"Groundwater over-exploited around {place}",
                            f"Extraction is {stage:.0f}% of annual recharge (state-level survey).",
                            "Prioritise recharge pits and storage; avoid new borewells."))
    elif stage is not None and stage >= 90:
        alerts.append(Alert("drought", "watch", f"Groundwater critical around {place}",
                            f"Extraction is {stage:.0f}% of annual recharge (state-level survey).",
                            "Add a recharge pit alongside storage."))
    if forecast and forecast.days and forecast.rain_free_days == len(forecast.days) and _rain(record)["annual"] < 600:
        alerts.append(Alert("drought", "watch", f"Dry week ahead for {place}",
                            f"No meaningful rain in the next {len(forecast.days)} days in a low-rainfall district.",
                            "Ration non-essential use; check stored-water days remaining."))

    alerts.sort(key=lambda a: -_SEVERITY[a.level])
    return alerts


# ------------------------------------------------------------------ water balance
def longest_dry_spell_days(annual_mm: float) -> int:
    """Rough longest rain-free stretch (days) from annual rainfall - a sizing heuristic, not a measurement."""
    return int(round(interp(annual_mm, [(200, 300), (500, 240), (800, 200), (1200, 170), (2000, 120), (4000, 80)])))


def water_balance(record: Dict[str, Any], roof_area_sqm: float, members: int, runoff_coeff: float = 0.8,
                  lpcd: float = 135.0, heat: Optional[Dict[str, Any]] = None,
                  design_storm_mm: float = 50.0) -> Dict[str, Any]:
    """Sizing numbers that connect the hazards to a rooftop system.

    1 mm of rain on 1 m2 yields 1 litre, so harvest = area x rainfall x runoff coefficient.
    """
    r = _rain(record)
    roof_area_sqm = max(0.0, roof_area_sqm)
    members = max(1, int(members))
    annual_l = roof_area_sqm * r["annual"] * runoff_coeff
    monsoon_l = roof_area_sqm * r["monsoon"] * runoff_coeff
    daily_l = lpcd * members
    heat_mult = 1.0 + 0.35 * min(1.0, (heat or {}).get("score", 0) / 100.0)
    spell = longest_dry_spell_days(r["annual"])
    tank = min(daily_l * spell, monsoon_l * 0.6)
    tank = max(0.0, (tank // 500.0) * 500.0)
    return {
        "assumptions": {"runoff_coefficient": runoff_coeff, "litres_per_person_per_day": lpcd,
                        "design_storm_mm": design_storm_mm, "dry_spell_days_estimated": spell},
        "annual_harvest_l": round(annual_l),
        "monsoon_harvest_l": round(monsoon_l),
        "kept_off_the_street_l": round(monsoon_l),
        "first_hour_storm_runoff_l": round(roof_area_sqm * runoff_coeff * design_storm_mm),
        "household_daily_demand_l": round(daily_l),
        "hot_day_demand_l": round(daily_l * heat_mult),
        "self_sufficiency_days": round(min(365.0, annual_l / daily_l), 1) if daily_l else 0.0,
        "recommended_tank_l": int(tank),
        "recharge_pit_recommended": bool(
            (_gw_stage(record) or 0) >= 70 or r["monsoon"] >= 1500 or r["monsoon"] / max(r["annual"], 1) > 0.85),
    }
