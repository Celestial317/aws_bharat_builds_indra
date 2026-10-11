"""Vendor discovery: a curated directory (always available) plus best-effort live web results.

The curated JSON (``indra/data/vendors.json``) works offline. Live results come from DuckDuckGo's
HTML endpoint with a short timeout and a one-hour cache; if it fails the curated list is returned.
Contact details are never invented: unknown fields stay empty.
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel

from ..core.logging import get_logger

log = get_logger("vendors")
DATA_DIR = Path(__file__).resolve().parents[1] / "data"

CITY_ALIASES = {
    "delhi": "delhi", "new delhi": "delhi", "ncr": "delhi", "gurgaon": "delhi", "gurugram": "delhi", "noida": "delhi",
    "mumbai": "mumbai", "bombay": "mumbai", "navi mumbai": "mumbai", "thane": "mumbai",
    "bangalore": "bangalore", "bengaluru": "bangalore",
    "chennai": "chennai", "madras": "chennai",
    "hyderabad": "hyderabad", "secunderabad": "hyderabad",
    "pune": "pune", "pimpri": "pune", "chinchwad": "pune",
    "kolkata": "kolkata", "calcutta": "kolkata", "howrah": "kolkata",
}
CATEGORIES = {  # api bucket -> (curated key, vendor category label, web query)
    "stores": ("stores", "store", "plumbing hardware water tank store"),
    "mechanics": ("mechanics", "mechanic", "rainwater harvesting contractor installation"),
    "components": ("components", "component", "rainwater harvesting filter first flush supplier"),
    "service_providers": ("services", "service", "rainwater harvesting consultant maintenance"),
}
_WEB_CACHE: Dict[Tuple[str, str], Tuple[float, List[Dict[str, Any]]]] = {}
_WEB_TTL = 3600.0
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; INDRA/2.0; +https://indra.local)", "Accept-Language": "en-IN,en;q=0.8"}


class VendorResult(BaseModel):
    name: str
    category: str
    location: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    rating: Optional[float] = None
    price_range: Optional[str] = None
    distance: Optional[float] = None
    source: str = "curated"


def _load(name: str) -> Dict[str, Any]:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


_VENDORS = _load("vendors.json")
_DIY = _load("diy_guide.json")


def city_key(location: str) -> Optional[str]:
    text = (location or "").lower().strip()
    for alias, key in sorted(CITY_ALIASES.items(), key=lambda kv: -len(kv[0])):
        if alias in text:
            return key
    return None


def _curated(location: str, bucket: str) -> List[VendorResult]:
    key = city_key(location)
    curated_key, label, _ = CATEGORIES[bucket]
    rows = _VENDORS["cities"].get(key, {}).get(curated_key, []) if key else []
    return [VendorResult(name=v["name"], category=label, location=v.get("location", location), contact=v.get("contact"),
                         website=v.get("website"), description=v.get("description", ""), rating=v.get("rating"),
                         price_range=v.get("price_range"), source="curated") for v in rows]


def _search_links(location: str, bucket: str) -> List[VendorResult]:
    """Honest fallback for cities without curated data: links, not made-up businesses."""
    q = urllib.parse.quote_plus(f"{CATEGORIES[bucket][2]} {location}")
    label = CATEGORIES[bucket][1]
    return [
        VendorResult(name=f"Search the web: {label}s in {location}", category=label, location=location,
                     website=f"https://www.google.com/search?q={q}", source="search_link",
                     description="Opens a web search for local providers."),
        VendorResult(name="IndiaMART - verified suppliers", category=label, location=location,
                     website=f"https://dir.indiamart.com/search.mp?ss={urllib.parse.quote_plus('rainwater harvesting')}",
                     source="search_link", description="Browse suppliers and compare quotes."),
    ]


def _parse_duckduckgo(html: str, label: str, location: str, limit: int = 4) -> List[Dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for block in soup.select("div.result"):
        link = block.select_one("a.result__a")
        if not link or not link.get("href"):
            continue
        href = link["href"]
        if "uddg=" in href:
            href = urllib.parse.unquote(urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("uddg", [href])[0])
        if not href.startswith("http") or "duckduckgo.com" in href:
            continue
        snippet = block.select_one(".result__snippet")
        out.append({"name": link.get_text(" ", strip=True)[:90], "website": href,
                    "description": (snippet.get_text(" ", strip=True) if snippet else "")[:220]})
        if len(out) >= limit:
            break
    return out


async def _web(bucket: str, location: str, client: httpx.AsyncClient) -> List[VendorResult]:
    label = CATEGORIES[bucket][1]
    key = (bucket, location.lower())
    cached = _WEB_CACHE.get(key)
    if cached and time.monotonic() - cached[0] < _WEB_TTL:
        rows = cached[1]
    else:
        try:
            response = await client.post("https://html.duckduckgo.com/html/",
                                         data={"q": f"{CATEGORIES[bucket][2]} {location} India"})
            response.raise_for_status()
            rows = _parse_duckduckgo(response.text, label, location)
        except (httpx.HTTPError, ValueError) as exc:
            log.info("live vendor search skipped (%s)", type(exc).__name__)
            rows = []
        _WEB_CACHE[key] = (time.monotonic(), rows)
    return [VendorResult(name=r["name"], category=label, location=location, website=r["website"],
                         description=r["description"], source="web") for r in rows]


def _sort(vendors: List[VendorResult]) -> List[VendorResult]:
    return sorted(vendors, key=lambda v: (-(v.rating or 0), v.distance if v.distance is not None else 1e9))


async def search_vendors(location: str, search_type: str = "all", live: bool = True) -> Dict[str, List[Dict[str, Any]]]:
    wanted = [b for b in CATEGORIES if search_type in ("all", b, b.rstrip("s"))] or list(CATEGORIES)
    results: Dict[str, List[VendorResult]] = {b: _curated(location, b) for b in wanted}
    if live:
        async with httpx.AsyncClient(timeout=5.0, headers=_HEADERS, follow_redirects=True) as client:
            web = await asyncio.gather(*(_web(b, location, client) for b in wanted))
        for bucket, found in zip(wanted, web):
            results[bucket].extend(found)
    for bucket in wanted:
        if not results[bucket]:
            results[bucket] = _search_links(location, bucket)
    online = [VendorResult(name=s["name"], category="online", website=s["website"], description=s["description"],
                           rating=s.get("rating"), price_range=s.get("price_range"))
              for s in _VENDORS["national_online"]]
    out = {b: [v.model_dump() for v in _sort(vs)] for b, vs in results.items()}
    out["online_stores"] = [v.model_dump() for v in _sort(online)] if search_type in ("all", "online", "online_stores") else []
    for bucket in ("stores", "mechanics", "components", "service_providers"):
        out.setdefault(bucket, [])
    return out


def diy_guide() -> Dict[str, Any]:
    return _DIY
