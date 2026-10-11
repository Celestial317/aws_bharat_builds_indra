"""Alert subscriptions and the community alert feed. Authorization is decided by Cedar policies."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from indra_climate import assess_risk, fetch_forecast

from ..config import get_settings
from ..core.errors import AppError
from ..core.security import Principal, get_principal
from ..data.gis import gis_manager
from ..policy.authz import authorize
from ..services.stores import get_store

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class SubscriptionIn(BaseModel):
    district: str = Field(..., min_length=2, max_length=80)
    state: Optional[str] = Field(None, max_length=80)
    channel: Literal["email", "sms", "push"] = "email"
    contact: str = Field(..., min_length=3, max_length=160, description="Email address or phone number")
    hazards: List[Literal["flood", "drought", "heat"]] = ["flood", "drought", "heat"]


class PublishIn(BaseModel):
    district: str = Field(..., min_length=2, max_length=80)
    state: Optional[str] = Field(None, max_length=80)
    type: Literal["flood", "drought", "heat"]
    level: Literal["info", "watch", "warning", "critical"] = "watch"
    title: str = Field(..., min_length=3, max_length=140)
    detail: str = Field("", max_length=600)
    action: str = Field("", max_length=300)


def _district_key(district: str, state: Optional[str]) -> Dict[str, Any]:
    record = gis_manager.record(district=district, state=state)
    if record is None:
        raise AppError(404, f"Unknown district '{district}'.")
    return record


@router.post("/subscriptions", status_code=201)
async def subscribe(body: SubscriptionIn, me: Principal = Depends(get_principal)) -> Dict[str, Any]:
    record = _district_key(body.district, body.state)
    authorize(me, "ManageSubscription", "Subscription", "new", {"owner": me.uid})
    item = body.model_dump()
    item.update(district=record["district"], state=record["state"], districtKey=record["key"])
    return await asyncio.to_thread(get_store().add_subscription, me.uid, item)


@router.get("/subscriptions")
async def my_subscriptions(me: Principal = Depends(get_principal)) -> Dict[str, Any]:
    items = await asyncio.to_thread(get_store().list_subscriptions, me.uid)
    return {"subscriptions": items}


@router.delete("/subscriptions/{sub_id}", status_code=204)
async def unsubscribe(sub_id: str, me: Principal = Depends(get_principal)) -> None:
    sub = await asyncio.to_thread(get_store().get_subscription, me.uid, sub_id)
    if sub is None:
        raise AppError(404, "Subscription not found.")
    authorize(me, "ManageSubscription", "Subscription", sub_id, {"owner": sub["userId"]})
    await asyncio.to_thread(get_store().delete_subscription, me.uid, sub_id)


@router.post("/publish", status_code=201)
async def publish(body: PublishIn, me: Principal = Depends(get_principal)) -> Dict[str, Any]:
    """Community leaders and admins push an alert to everyone watching a district."""
    record = _district_key(body.district, body.state)
    authorize(me, "PublishAlert", "AlertChannel", record["key"])
    alert = {"type": body.type, "level": body.level, "title": body.title, "detail": body.detail,
             "action": body.action, "source": f"community:{me.uid}"}
    return await asyncio.to_thread(get_store().add_alert, record["key"], alert)


@router.get("/feed")
async def feed(district: str = Query(..., max_length=80), state: Optional[str] = Query(None, max_length=80),
               limit: int = Query(20, ge=1, le=50)) -> Dict[str, Any]:
    """Live computed alerts plus stored ones (Lambda evaluator + community-published)."""
    record = _district_key(district, state)
    forecast = None
    if get_settings().forecast_enabled:
        forecast = await asyncio.to_thread(fetch_forecast, record.get("latitude"), record.get("longitude"))
    live = [{**a.to_dict(), "source": "live"} for a in assess_risk(record, forecast).alerts]
    stored = await asyncio.to_thread(get_store().list_alerts, record["key"], limit)
    return {"district": record["district"], "state": record["state"], "live": live, "stored": stored,
            "store": get_store().name}
