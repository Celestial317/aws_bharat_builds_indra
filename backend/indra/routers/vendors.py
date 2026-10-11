"""Vendor search and the DIY installation guide."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Query

from ..config import get_settings
from ..services import vendors

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("/search")
async def search(
    location: str = Query(..., min_length=2, max_length=100, description="City or area"),
    search_type: str = Query("all", pattern="^(all|stores|mechanics|components|online|services|service_providers)$"),
) -> Dict[str, Any]:
    kind = "service_providers" if search_type == "services" else search_type
    results = await vendors.search_vendors(location.strip(), kind, live=get_settings().vendor_live_search)
    return {"success": True, "location": location, "timestamp": datetime.now().isoformat(), "results": results}


@router.get("/diy-guide")
async def diy_guide() -> Dict[str, Any]:
    return {"success": True, **vendors.diy_guide()}
