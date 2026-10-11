"""Location data for the feature modules, served from the bundled climate atlas.

Replaces the old pandas loader that read an 88 MB CSV (whose rainfall/groundwater columns had been
z-score normalised). Start-up is now instant and memory use is a few MB.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from indra_climate import Atlas, get_atlas

_MATCH_CONFIDENCE = {"exact_pincode": 0.95, "district": 0.85, "nearest_pincode": 0.8, "regional_pincode": 0.6, "state": 0.5}
_SOURCE_FACTOR = {"imd_override": 1.0, "observed": 1.0, "neighbor_imputed": 0.8, "regional_estimate": 0.7,
                  "state_average": 0.75, "state_median": 0.6}


def split_location(location: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """'Pune, Maharashtra' -> ('Pune', 'Maharashtra'); 'Pune' -> ('Pune', None)."""
    parts = [p.strip() for p in (location or "").split(",") if p.strip()]
    return (parts[0] if parts else None, parts[1] if len(parts) > 1 else None)


class GISDataManager:
    def __init__(self, atlas: Optional[Atlas] = None):
        self.atlas = atlas or get_atlas()

    @property
    def loaded(self) -> bool:
        return self.atlas.loaded

    def load_data(self) -> bool:
        self.atlas.load()
        return True

    def record(self, pincode: Optional[str] = None, district: Optional[str] = None,
               state: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Raw atlas record (the shape :mod:`indra_climate` consumes), with match metadata."""
        return self.atlas.find(pincode=pincode, district=district, state=state)

    def get_location_data(self, pincode: Optional[str] = None, district: Optional[str] = None,
                          state: Optional[str] = None) -> Optional[Dict[str, Any]]:
        rec = self.record(pincode, district, state)
        if rec is None:
            return None
        rain, gw = rec["rainfall"], rec["groundwater"]
        match = rec.get("match_type", "unknown")
        confidence = _MATCH_CONFIDENCE.get(match, 0.5) * _SOURCE_FACTOR.get(rain.get("source"), 0.7)
        out = {
            "pincode": str(pincode or ""),
            "district": rec["district"],
            "state": rec["state"],
            "latitude": rec.get("latitude"),
            "longitude": rec.get("longitude"),
            "rainfall": {
                "monsoon": rain.get("monsoon") or 0.0,
                "post_monsoon": rain.get("post_monsoon") or 0.0,
                "summer": rain.get("summer") or 0.0,
                "winter": rain.get("winter") or 0.0,
                "total_annual": rain.get("annual") or 0.0,
            },
            "groundwater": {
                "recharge_bcm": gw.get("recharge_bcm") or 0.0,
                "resource_bcm": gw.get("resource_bcm") or 0.0,
                "extraction_bcm": gw.get("extraction_bcm") or 0.0,
                "extraction_percentage": gw.get("stage_pct") if gw.get("stage_pct") is not None else 50.0,
                "scope": gw.get("scope", "state"),
            },
            "match_type": match,
            "rainfall_source": rain.get("source"),
            "confidence": round(confidence, 2),
            "record": rec,
        }
        if rec.get("note"):
            out["note"] = rec["note"]
        return out

    @staticmethod
    def get_water_stress_level(location_data: Dict[str, Any]) -> str:
        """CGWB categories from the stage of groundwater extraction."""
        pct = location_data.get("groundwater", {}).get("extraction_percentage")
        if not isinstance(pct, (int, float)) or pct < 0:
            return "Data Unavailable"
        if pct < 70:
            return "Safe"
        if pct < 90:
            return "Semi-Critical"
        if pct < 100:
            return "Critical"
        return "Over-Exploited"


gis_manager = GISDataManager()
