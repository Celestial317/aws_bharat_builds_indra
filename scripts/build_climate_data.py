"""Build the bundled climate atlas from the raw survey CSV.

Input : data/raw/Indra_Database.csv  (pincode-level rainfall + CGWB groundwater survey)
Output: packages/indra_climate/indra_climate/data/districts.json
        packages/indra_climate/indra_climate/data/pincodes.csv.gz

Why this exists
  * The old "processed" CSV had z-score-normalised rainfall/groundwater columns (negative values)
    and filled missing rainfall with the *global median*. This script uses the raw values instead.
  * ~half of the districts have no rainfall observation. They are imputed from the three nearest
    observed districts (inverse-distance weighted, max 450 km), then from the state median, and
    flagged via ``rainfall.source``. IMD overrides (see overrides.py) win over everything.

Usage:  python scripts/build_climate_data.py [--raw PATH]
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages" / "indra_climate"))
from indra_climate.overrides import RAINFALL_OVERRIDES, REGIONAL_ESTIMATES  # noqa: E402

SEASONS = {
    "monsoon": "Monsoon (Jun-Sep)",
    "post_monsoon": "Post-Monsoon (Oct-Dec)",
    "summer": "Summer/Pre-Monsoon (Mar-May)",
    "winter": "Winter (Jan-Feb)",
    "annual": "Total Annual Rainfall (mm)",
}
GW = {
    "recharge_bcm": "Total Annual Ground Water Recharge (in BCM)",
    "resource_bcm": "Annual Extractable Ground Water Resource (in BCM)",
    "extraction_bcm": "Current Annual Ground Water Extraction (in BCM) - Total",
    "stage_pct": "Stage of Ground Water Extraction (%)",
}
INDIA_BBOX = (6.0, 38.5, 68.0, 98.5)  # lat_min, lat_max, lon_min, lon_max
MAX_IMPUTE_KM = 450.0


def clean_name(raw: str) -> str:
    """Title-case a place name, drop a leading 'The', keep 'and'/'of' lower-case. 'nan' -> ''."""
    text = (raw or "").strip()
    if not text or text.lower() == "nan":
        return ""
    words = text.title().split()
    if words and words[0] == "The":
        words = words[1:]
    return " ".join(w.lower() if w in ("And", "Of") else w for w in words)


def num(value: str):
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(out) else out


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def med(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--raw", default=str(ROOT / "data" / "raw" / "Indra_Database.csv"))
    args = parser.parse_args()
    out_dir = ROOT / "packages" / "indra_climate" / "indra_climate" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    groups = defaultdict(lambda: defaultdict(list))
    pin_to_key = {}
    with open(args.raw, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            state, district = clean_name(row["State"]), clean_name(row["District"])
            if not state or not district:
                continue
            key = f"{state}|{district}"
            pin = row["pincode"].strip().zfill(6)
            pin_to_key[pin] = key
            g = groups[key]
            g["n"].append(1)
            lat, lon = num(row["latitude"]), num(row["longitude"])
            if lat is not None and lon is not None and INDIA_BBOX[0] <= lat <= INDIA_BBOX[1] and INDIA_BBOX[2] <= lon <= INDIA_BBOX[3]:
                g["lat"].append(lat)
                g["lon"].append(lon)
            for name, col in {**SEASONS, **GW}.items():
                g[name].append(num(row[col]))

    districts = []
    for key, g in sorted(groups.items()):
        state, district = key.split("|")
        rain = {k: med(g[k]) for k in SEASONS}
        gw = {k: med(g[k]) for k in GW}
        districts.append({
            "key": key, "state": state, "district": district,
            "latitude": round(med(g["lat"]), 4) if g["lat"] else None,
            "longitude": round(med(g["lon"]), 4) if g["lon"] else None,
            "n_pincodes": len(g["n"]),
            "rainfall": {**rain, "source": "observed" if rain["annual"] is not None else None},
            "groundwater": {**gw, "scope": "state"},
        })

    # Groundwater values repeat per state (one survey row per state): label scope honestly.
    per_state = defaultdict(set)
    for d in districts:
        per_state[d["state"]].add(d["groundwater"]["stage_pct"])
    if all(len(v) <= 1 for v in per_state.values()):
        print("Groundwater stage is constant within every state -> scope='state'")
    else:
        for d in districts:
            d["groundwater"]["scope"] = "district"

    observed = [d for d in districts if d["rainfall"]["annual"] is not None and d["latitude"] is not None]
    state_median = {}
    for state in {d["state"] for d in districts}:
        vals = [d for d in observed if d["state"] == state]
        if vals:
            state_median[state] = {k: statistics.median(d["rainfall"][k] for d in vals) for k in SEASONS}

    counts = defaultdict(int)
    for d in districts:
        override = RAINFALL_OVERRIDES.get(d["district"].upper())
        if override:
            d["rainfall"] = {**{k: float(override[k]) for k in SEASONS}, "source": "imd_override"}
        elif d["rainfall"]["annual"] is None:
            near = []
            if d["latitude"] is not None:
                near = sorted(
                    ((haversine_km(d["latitude"], d["longitude"], o["latitude"], o["longitude"]), o) for o in observed),
                    key=lambda t: t[0])[:3]
                near = [(dist, o) for dist, o in near if dist <= MAX_IMPUTE_KM]
            if near:
                weights = [1.0 / max(dist, 5.0) for dist, _ in near]
                d["rainfall"] = {**{k: sum(w * o["rainfall"][k] for w, (_, o) in zip(weights, near)) / sum(weights)
                                    for k in SEASONS}, "source": "neighbor_imputed"}
            elif d["state"] in state_median:
                d["rainfall"] = {**state_median[d["state"]], "source": "state_median"}
            elif d["state"] in REGIONAL_ESTIMATES:
                est = REGIONAL_ESTIMATES[d["state"]]
                d["rainfall"] = {**{k: float(est[k]) for k in SEASONS}, "source": "regional_estimate"}
                if d["latitude"] is None:
                    d["latitude"], d["longitude"] = est["latitude"], est["longitude"]
            else:
                d["rainfall"] = {**{k: None for k in SEASONS}, "source": "unavailable"}
        counts[d["rainfall"]["source"]] += 1

        r = d["rainfall"]
        parts = [r[k] for k in ("monsoon", "post_monsoon", "summer", "winter")]
        if all(p is not None for p in parts) and (r["annual"] is None or r["annual"] < 0.5 * sum(parts)):
            r["annual"] = sum(parts)
        for k in list(r):
            if isinstance(r[k], float):
                r[k] = round(r[k], 1)
        for k in list(d["groundwater"]):
            if isinstance(d["groundwater"][k], float):
                d["groundwater"][k] = round(d["groundwater"][k], 3)

    usable = [d for d in districts if d["rainfall"]["annual"] is not None]
    (out_dir / "districts.json").write_text(
        json.dumps({"generated_from": "Indra_Database.csv", "rainfall_sources": dict(counts), "districts": usable},
                   separators=(",", ":")), encoding="utf-8")
    keys = {d["key"] for d in usable}
    with gzip.open(out_dir / "pincodes.csv.gz", "wt", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["pincode", "key"])
        for pin, key in sorted(pin_to_key.items()):
            if key in keys:
                writer.writerow([pin, key])
    print(f"districts: {len(usable)}/{len(districts)}  pincodes: {len(pin_to_key)}  rainfall sources: {dict(counts)}")


if __name__ == "__main__":
    main()
