"""Storage for alert subscriptions and published alerts.

``DynamoStore`` talks to DynamoDB (LocalStack in development, real AWS if you choose) using the same
table layout the SAM template in ``serverless/`` creates, so the Lambda evaluator and this API share
data. ``MemoryStore`` keeps everything in-process for zero-setup demos and tests.
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional, Protocol

from ..config import Settings, get_settings
from ..core.logging import get_logger

log = get_logger("stores")
ALERT_TTL_S = 14 * 24 * 3600


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store(Protocol):
    name: str

    def add_subscription(self, user_id: str, item: Dict[str, Any]) -> Dict[str, Any]: ...
    def list_subscriptions(self, user_id: str) -> List[Dict[str, Any]]: ...
    def get_subscription(self, user_id: str, sub_id: str) -> Optional[Dict[str, Any]]: ...
    def delete_subscription(self, user_id: str, sub_id: str) -> None: ...
    def add_alert(self, district_key: str, alert: Dict[str, Any]) -> Dict[str, Any]: ...
    def list_alerts(self, district_key: str, limit: int = 20) -> List[Dict[str, Any]]: ...
    def healthy(self) -> bool: ...


class MemoryStore:
    name = "memory"

    def __init__(self):
        self._subs: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._alerts: Dict[str, List[Dict[str, Any]]] = {}
        self._lock = threading.Lock()

    def add_subscription(self, user_id, item):
        record = {**item, "userId": user_id, "subId": uuid.uuid4().hex[:12], "createdAt": now_iso()}
        with self._lock:
            self._subs.setdefault(user_id, {})[record["subId"]] = record
        return record

    def list_subscriptions(self, user_id):
        with self._lock:
            return list(self._subs.get(user_id, {}).values())

    def get_subscription(self, user_id, sub_id):
        with self._lock:
            return self._subs.get(user_id, {}).get(sub_id)

    def delete_subscription(self, user_id, sub_id):
        with self._lock:
            self._subs.get(user_id, {}).pop(sub_id, None)

    def add_alert(self, district_key, alert):
        record = {**alert, "districtKey": district_key, "ts": now_iso() + f"#{uuid.uuid4().hex[:6]}"}
        with self._lock:
            bucket = self._alerts.setdefault(district_key, [])
            bucket.append(record)
            del bucket[:-100]
        return record

    def list_alerts(self, district_key, limit=20):
        with self._lock:
            return sorted(self._alerts.get(district_key, []), key=lambda a: a["ts"], reverse=True)[:limit]

    def healthy(self):
        return True


class DynamoStore:
    name = "dynamodb"

    def __init__(self, settings: Settings):
        import boto3

        self.settings = settings
        kwargs: Dict[str, Any] = {"region_name": settings.aws_region}
        if settings.aws_endpoint_url:  # LocalStack accepts any credentials
            kwargs.update(endpoint_url=settings.aws_endpoint_url, aws_access_key_id="test", aws_secret_access_key="test")
        self._ddb = boto3.resource("dynamodb", **kwargs)
        self.subs = self._ddb.Table(settings.subscriptions_table)
        self.alerts = self._ddb.Table(settings.alerts_table)

    def add_subscription(self, user_id, item):
        record = {**item, "userId": user_id, "subId": uuid.uuid4().hex[:12], "createdAt": now_iso()}
        self.subs.put_item(Item=record)
        return record

    def list_subscriptions(self, user_id):
        from boto3.dynamodb.conditions import Key

        return self.subs.query(KeyConditionExpression=Key("userId").eq(user_id)).get("Items", [])

    def get_subscription(self, user_id, sub_id):
        return self.subs.get_item(Key={"userId": user_id, "subId": sub_id}).get("Item")

    def delete_subscription(self, user_id, sub_id):
        self.subs.delete_item(Key={"userId": user_id, "subId": sub_id})

    def add_alert(self, district_key, alert):
        record = {**alert, "districtKey": district_key, "ts": now_iso() + f"#{uuid.uuid4().hex[:6]}",
                  "expiresAt": int(time.time()) + ALERT_TTL_S}
        self.alerts.put_item(Item=record)
        return record

    def list_alerts(self, district_key, limit=20):
        from boto3.dynamodb.conditions import Key

        resp = self.alerts.query(KeyConditionExpression=Key("districtKey").eq(district_key),
                                 ScanIndexForward=False, Limit=limit)
        return resp.get("Items", [])

    def healthy(self):
        try:
            self.subs.load()
            self.alerts.load()
            return True
        except Exception as exc:
            log.warning("DynamoDB unavailable: %s", type(exc).__name__)
            return False


@lru_cache(maxsize=1)
def get_store() -> Store:
    settings = get_settings()
    if settings.effective_alerts_backend == "dynamodb":
        try:
            store = DynamoStore(settings)
            if store.healthy():
                log.info("alerts store: DynamoDB (%s)", settings.aws_endpoint_url or "aws")
                return store
            log.warning("DynamoDB not reachable - using in-memory alerts store")
        except Exception as exc:
            log.warning("DynamoDB init failed (%s) - using in-memory alerts store", exc)
    return MemoryStore()
