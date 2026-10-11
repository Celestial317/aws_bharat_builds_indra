"""7-day weather forecast via Open-Meteo (free, no API key). Standard library only.

Network failures never raise: ``fetch_forecast`` returns ``None`` and callers fall back to the
climatological estimate in :mod:`indra_climate.engine`.
"""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
_CACHE: Dict[Tuple[float, float, int], Tuple[float, "Forecast"]] = {}
_CACHE_LOCK = threading.Lock()


@dataclass
class ForecastDay:
    date: str
    precip_mm: float
    tmax_c: Optional[float]
    precip_prob: Optional[float] = None


@dataclass
class Forecast:
    latitude: float
    longitude: float
    days: List[ForecastDay] = field(default_factory=list)
    source: str = "open-meteo"

    @property
    def total_precip_mm(self) -> float:
        return round(sum(d.precip_mm for d in self.days), 1)

    @property
    def peak_daily_precip_mm(self) -> float:
        return max((d.precip_mm for d in self.days), default=0.0)

    @property
    def peak_tmax_c(self) -> Optional[float]:
        temps = [d.tmax_c for d in self.days if d.tmax_c is not None]
        return max(temps) if temps else None

    @property
    def rain_free_days(self) -> int:
        return sum(1 for d in self.days if d.precip_mm < 1.0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source": self.source,
            "total_precip_mm": self.total_precip_mm,
            "peak_daily_precip_mm": round(self.peak_daily_precip_mm, 1),
            "peak_tmax_c": self.peak_tmax_c,
            "rain_free_days": self.rain_free_days,
            "days": [d.__dict__.copy() for d in self.days],
        }

    @classmethod
    def from_daily(cls, latitude: float, longitude: float, daily: Dict[str, List[Any]],
                   source: str = "open-meteo") -> "Forecast":
        """Build from an Open-Meteo style ``daily`` block (parallel arrays)."""
        dates = daily.get("time", [])
        precip = daily.get("precipitation_sum", [])
        tmax = daily.get("temperature_2m_max", [])
        prob = daily.get("precipitation_probability_max", [])
        days = []
        for i, date in enumerate(dates):
            days.append(ForecastDay(
                date=str(date),
                precip_mm=float(precip[i] or 0.0) if i < len(precip) else 0.0,
                tmax_c=float(tmax[i]) if i < len(tmax) and tmax[i] is not None else None,
                precip_prob=float(prob[i]) if i < len(prob) and prob[i] is not None else None,
            ))
        return cls(latitude=latitude, longitude=longitude, days=days, source=source)


def fetch_forecast(latitude: Optional[float], longitude: Optional[float], days: int = 7,
                   timeout: float = 6.0, ttl: float = 1800.0) -> Optional[Forecast]:
    """Fetch (and cache for ``ttl`` seconds) the daily forecast. Returns ``None`` on any failure."""
    if latitude is None or longitude is None:
        return None
    key = (round(float(latitude), 2), round(float(longitude), 2), days)
    now = time.monotonic()
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]

    query = urllib.parse.urlencode({
        "latitude": key[0], "longitude": key[1], "forecast_days": days, "timezone": "auto",
        "daily": "precipitation_sum,temperature_2m_max,precipitation_probability_max",
    })
    try:
        request = urllib.request.Request(f"{OPEN_METEO_URL}?{query}", headers={"User-Agent": "indra-climate/1.0"})
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed https host
            payload = json.load(response)
        forecast = Forecast.from_daily(key[0], key[1], payload.get("daily", {}))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
    if not forecast.days:
        return None
    with _CACHE_LOCK:
        _CACHE[key] = (now, forecast)
    return forecast
