"""District/pincode climate atlas backed by the bundled, pre-built data files.

``data/districts.json`` is produced by ``scripts/build_climate_data.py`` from the raw survey CSV
(real groundwater values, rainfall imputed from neighbouring districts where unobserved, IMD
overrides applied). ``data/pincodes.csv.gz`` maps every pincode to its district.
"""

from __future__ import annotations

import csv
import gzip
import json
import threading
from collections import Counter
from functools import lru_cache
from importlib import resources
from typing import Any, Dict, List, Optional


def _norm(text: Optional[str]) -> str:
    return " ".join((text or "").upper().replace("&", "AND").split())


class Atlas:
    """Read-only lookup over districts and pincodes. Thread-safe lazy loading."""

    def __init__(self, districts_path: Optional[str] = None, pincodes_path: Optional[str] = None):
        self._districts_path = districts_path
        self._pincodes_path = pincodes_path
        self._lock = threading.Lock()
        self._districts: List[Dict[str, Any]] = []
        self._by_key: Dict[str, Dict[str, Any]] = {}
        self._pincodes: Dict[str, str] = {}
        self._prefix3: Dict[str, str] = {}
        self._prefix2: Dict[str, str] = {}
        self._loaded = False

    # ----------------------------------------------------------------- loading
    @property
    def loaded(self) -> bool:
        return self._loaded

    def load(self) -> "Atlas":
        if self._loaded:
            return self
        with self._lock:
            if self._loaded:
                return self
            self._load_districts()
            self._load_pincodes()
            self._loaded = True
        return self

    def _open(self, explicit: Optional[str], name: str, binary: bool):
        if explicit:
            return open(explicit, "rb" if binary else "r", encoding=None if binary else "utf-8")
        return resources.files("indra_climate").joinpath("data", name).open(
            "rb" if binary else "r", encoding=None if binary else "utf-8")

    def _load_districts(self) -> None:
        with self._open(self._districts_path, "districts.json", binary=False) as fh:
            self._districts = json.load(fh)["districts"]
        self._by_key = {d["key"]: d for d in self._districts}

    def _load_pincodes(self) -> None:
        try:
            fh = self._open(self._pincodes_path, "pincodes.csv.gz", binary=True)
        except (FileNotFoundError, OSError):
            return
        by3: Dict[str, Counter] = {}
        by2: Dict[str, Counter] = {}
        with fh, gzip.open(fh, "rt", encoding="utf-8", newline="") as text:
            for row in csv.reader(text):
                if not row or row[0] == "pincode":
                    continue
                pin, key = row[0], row[1]
                self._pincodes[pin] = key
                by3.setdefault(pin[:3], Counter())[key] += 1
                by2.setdefault(pin[:2], Counter())[key] += 1
        self._prefix3 = {k: c.most_common(1)[0][0] for k, c in by3.items()}
        self._prefix2 = {k: c.most_common(1)[0][0] for k, c in by2.items()}

    # ----------------------------------------------------------------- queries
    def __len__(self) -> int:
        return len(self.load()._districts)

    def states(self) -> List[str]:
        return sorted({d["state"] for d in self.load()._districts})

    def districts(self, state: Optional[str] = None) -> List[Dict[str, Any]]:
        items = self.load()._districts
        if state:
            wanted = _norm(state)
            items = [d for d in items if _norm(d["state"]) == wanted]
        return items

    def by_key(self, key: str) -> Optional[Dict[str, Any]]:
        return self.load()._by_key.get(key)

    def find(self, pincode: Optional[str] = None, district: Optional[str] = None,
             state: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Best-effort lookup. Returns a copy of the district record with ``match_type``/``note``.

        Priority: exact pincode, pincode prefix (3 then 2 digits), district name, state average.
        """
        self.load()
        pin = str(pincode).strip() if pincode is not None else ""
        if pin:
            for kind, table, size in (("exact_pincode", self._pincodes, 6),
                                      ("nearest_pincode", self._prefix3, 3),
                                      ("regional_pincode", self._prefix2, 2)):
                if len(pin) < size:
                    continue
                key = table.get(pin if size == 6 else pin[:size])
                if key and key in self._by_key:
                    note = "" if kind == "exact_pincode" else (
                        f"Using nearest available data (pincode prefix {pin[:size]}...)")
                    return self._result(self._by_key[key], kind, note)
        if district:
            record = self._match_district(district, state)
            if record:
                return self._result(record, "district", "")
        if state:
            record = self._state_average(state)
            if record:
                return self._result(record, "state", f"Using state-level average data for {state}")
        return None

    def _match_district(self, district: str, state: Optional[str]) -> Optional[Dict[str, Any]]:
        wanted = _norm(district)
        scoped = bool(state) and bool(self.districts(state))
        pool = self.districts(state) if scoped else self._districts
        for d in pool:
            if _norm(d["district"]) == wanted:
                return d
        for d in pool:
            name = _norm(d["district"])
            if wanted in name or name in wanted:
                return d
        if scoped:
            return self._match_district(district, None)
        return None

    def _state_average(self, state: str) -> Optional[Dict[str, Any]]:
        rows = self.districts(state)
        if not rows:
            wanted = _norm(state)
            rows = [d for d in self._districts if wanted in _norm(d["state"])]
        if not rows:
            return None

        def avg(*path: str) -> float:
            vals = []
            for r in rows:
                v: Any = r
                for p in path:
                    v = v.get(p) if isinstance(v, dict) else None
                if isinstance(v, (int, float)):
                    vals.append(v)
            return round(sum(vals) / len(vals), 2) if vals else 0.0

        lead = rows[0]
        rainfall = {k: avg("rainfall", k) for k in ("monsoon", "post_monsoon", "summer", "winter", "annual")}
        rainfall["source"] = "state_average"
        groundwater = {k: avg("groundwater", k) for k in ("recharge_bcm", "resource_bcm", "extraction_bcm", "stage_pct")}
        groundwater["scope"] = lead["groundwater"].get("scope", "state")
        return {
            "key": f"{lead['state']}|*", "state": lead["state"], "district": f"{lead['state']} (state average)",
            "latitude": avg("latitude"), "longitude": avg("longitude"),
            "n_pincodes": sum(r.get("n_pincodes", 0) for r in rows),
            "rainfall": rainfall, "groundwater": groundwater,
        }

    @staticmethod
    def _result(record: Dict[str, Any], match_type: str, note: str) -> Dict[str, Any]:
        out = json.loads(json.dumps(record))  # cheap deep copy of plain JSON data
        out["match_type"] = match_type
        if note:
            out["note"] = note
        return out


@lru_cache(maxsize=1)
def get_atlas() -> Atlas:
    """Process-wide atlas using the bundled data files."""
    return Atlas()
