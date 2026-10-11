"""Community clustering for droplets. Posts, profiles and assessments are handled client-side by Firestore."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.errors import AppError
from ..core.security import Principal, get_principal
from ..policy.authz import authorize
from ..services import clustering

router = APIRouter(prefix="/api/community", tags=["community"])


class Droplet(BaseModel):
    uid: str = Field(..., max_length=128)
    name: str = Field("", max_length=120)
    state: str = Field(..., max_length=80)
    district: str = Field(..., max_length=80)
    n_members: int = Field(4, ge=1, le=200)
    catchment_area: float = Field(100, ge=0)
    farmland_area: float = Field(0, ge=0)
    budget: float = Field(50000, ge=0)
    avg_rainfall: Optional[float] = Field(800, ge=0)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)


class TrainRequest(BaseModel):
    droplets: List[Droplet] = Field(..., min_length=5, max_length=5000)
    n_clusters: Optional[int] = Field(None, ge=2, le=20)


@router.get("/clusters")
async def clusters() -> Dict[str, Any]:
    info = await asyncio.to_thread(clustering.get_cluster_info)
    return {"clusters": info, "total_clusters": len(info)}


@router.post("/clusters/train")
async def train(body: TrainRequest, me: Principal = Depends(get_principal)) -> Dict[str, Any]:
    authorize(me, "TrainClusters", "System", "clustering")
    try:
        result = await asyncio.to_thread(clustering.train_clustering, [d.model_dump() for d in body.droplets], body.n_clusters)
    except ValueError as exc:
        raise AppError(422, str(exc)) from exc
    return {"success": True, "n_clusters": result.get("n_clusters"), "cluster_info": result.get("cluster_info"),
            "message": f"Model trained with {len(body.droplets)} droplets"}


@router.post("/clusters/predict")
async def predict(droplet: Droplet) -> Dict[str, Any]:
    cluster_id = await asyncio.to_thread(clustering.predict_cluster, droplet.model_dump())
    info = await asyncio.to_thread(clustering.get_cluster_info)
    return {"cluster_id": cluster_id, "cluster_info": info.get(str(cluster_id), {}), "droplet_uid": droplet.uid}
