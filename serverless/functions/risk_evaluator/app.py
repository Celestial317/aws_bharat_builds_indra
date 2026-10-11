"""Scheduled risk evaluator.

For every district someone subscribed to (or the districts listed in the invoke event) it scores
flood / drought / heat risk with the shared ``indra_climate`` engine, stores alerts that have not
fired recently, and publishes them to SNS.

Delivery: each new alert is also sent to every subscriber of that district - email through SES
(needs ``SES_SENDER``, a verified address) and SMS through SNS. Failures to deliver to one subscriber
never block the others.

Invoke event (all optional)::

    {"districts": ["Maharashtra|Pune"], "forecast": {"time": [...], "precipitation_sum": [...],
     "temperature_2m_max": [...]}, "dry_run": true}

``forecast`` overrides the live Open-Meteo call (used by tests and demos).
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

import boto3
from boto3.dynamodb.conditions import Key

from indra_climate import Forecast, evaluate_alerts, fetch_forecast, get_atlas

log = logging.getLogger()
log.setLevel(logging.INFO)

DEDUPE_WINDOW_S = 12 * 3600
ALERT_TTL_S = 14 * 24 * 3600
LEVEL_RANK = {"info": 0, "watch": 1, "warning": 2, "critical": 3}


def _tables():
    ddb = boto3.resource("dynamodb", endpoint_url=os.environ.get("AWS_ENDPOINT_URL") or None)
    return ddb.Table(os.environ["SUBSCRIPTIONS_TABLE"]), ddb.Table(os.environ["ALERTS_TABLE"])


def subscribed_districts(subscriptions) -> List[str]:
    """Distinct ``districtKey`` values across all subscriptions (paginated scan; small table)."""
    keys, kwargs = set(), {"ProjectionExpression": "districtKey"}
    while True:
        page = subscriptions.scan(**kwargs)
        keys.update(item["districtKey"] for item in page.get("Items", []) if item.get("districtKey"))
        if "LastEvaluatedKey" not in page:
            return sorted(keys)
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def subscribers_of(subscriptions, district_key: str, hazard: str) -> List[Dict[str, Any]]:
    """Subscriptions for a district (via the ``ByDistrict`` index) that asked for this hazard."""
    out, kwargs = [], {"IndexName": "ByDistrict", "KeyConditionExpression": Key("districtKey").eq(district_key)}
    while True:
        page = subscriptions.query(**kwargs)
        out.extend(s for s in page.get("Items", []) if hazard in (s.get("hazards") or [hazard]))
        if "LastEvaluatedKey" not in page:
            return out
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def recently_sent(alerts_table, district_key: str, alert: Dict[str, str], now: float) -> bool:
    """True if an alert with the same type, level and title was stored in the dedupe window."""
    cutoff = datetime.fromtimestamp(now - DEDUPE_WINDOW_S, tz=timezone.utc).isoformat(timespec="seconds")
    page = alerts_table.query(KeyConditionExpression=Key("districtKey").eq(district_key) & Key("ts").gt(cutoff),
                              ScanIndexForward=False, Limit=50)
    return any(a.get("type") == alert["type"] and a.get("level") == alert["level"] and a.get("title") == alert["title"]
               for a in page.get("Items", []))


def _forecast_for(record: Dict[str, Any], override: Optional[Dict[str, Any]]) -> Optional[Forecast]:
    if override:
        return Forecast.from_daily(record.get("latitude") or 0, record.get("longitude") or 0, override, source="event")
    if os.environ.get("FORECAST_ENABLED", "true").lower() != "true":
        return None
    return fetch_forecast(record.get("latitude"), record.get("longitude"))


def evaluate(district_keys: Iterable[str], alerts_table, publish, override: Optional[Dict[str, Any]] = None,
             now: Optional[float] = None, dry_run: bool = False, notify=None) -> Dict[str, Any]:
    atlas, now = get_atlas(), now or time.time()
    summary = {"evaluated": 0, "unknown": [], "alerts": 0, "published": 0, "skipped_duplicates": 0, "notified": 0}
    for key in district_keys:
        record = atlas.by_key(key)
        if record is None:
            summary["unknown"].append(key)
            continue
        summary["evaluated"] += 1
        for alert in evaluate_alerts(record, _forecast_for(record, override)):
            if LEVEL_RANK[alert.level] < LEVEL_RANK["watch"]:
                continue
            item = alert.to_dict()
            summary["alerts"] += 1
            if recently_sent(alerts_table, key, item, now):
                summary["skipped_duplicates"] += 1
                continue
            if dry_run:
                continue
            stamp = datetime.fromtimestamp(now, tz=timezone.utc).isoformat(timespec="seconds")
            alerts_table.put_item(Item={**item, "districtKey": key, "ts": f"{stamp}#{uuid.uuid4().hex[:6]}",
                                        "source": "evaluator", "expiresAt": int(now) + ALERT_TTL_S})
            publish(key, record, item)
            summary["published"] += 1
            if notify:
                summary["notified"] += notify(key, record, item)
    return summary


def make_publisher():
    topic = os.environ.get("ALERT_TOPIC_ARN")
    if not topic:
        return lambda key, record, item: None
    sns = boto3.client("sns", endpoint_url=os.environ.get("AWS_ENDPOINT_URL") or None)

    def publish(key: str, record: Dict[str, Any], item: Dict[str, str]) -> None:
        sns.publish(
            TopicArn=topic,
            Subject=f"[INDRA {item['level'].upper()}] {item['title']}"[:100],
            Message=json.dumps({"district": record["district"], "state": record["state"], **item}),
            MessageAttributes={
                "districtKey": {"DataType": "String", "StringValue": key},
                "hazard": {"DataType": "String", "StringValue": item["type"]},
                "level": {"DataType": "String", "StringValue": item["level"]},
            })
    return publish


def make_notifier(subscriptions):
    """Per-subscriber delivery. Returns a callable giving the number of messages sent."""
    endpoint = os.environ.get("AWS_ENDPOINT_URL") or None
    sender = os.environ.get("SES_SENDER")
    ses = boto3.client("ses", endpoint_url=endpoint) if sender else None
    sns = boto3.client("sns", endpoint_url=endpoint)

    def notify(key: str, record: Dict[str, Any], item: Dict[str, str]) -> int:
        sent = 0
        subject = f"[INDRA {item['level'].upper()}] {item['title']}"
        body = "\n".join([item["title"], item.get("detail", ""), "What to do: " + item.get("action", "")])
        for sub in subscribers_of(subscriptions, key, item["type"]):
            try:
                if sub.get("channel") == "sms":
                    sns.publish(PhoneNumber=sub["contact"], Message=f"{subject}. {item.get('action', '')}"[:300])
                elif sub.get("channel") == "email" and ses:
                    ses.send_email(Source=sender, Destination={"ToAddresses": [sub["contact"]]},
                                   Message={"Subject": {"Data": subject[:200]}, "Body": {"Text": {"Data": body}}})
                else:
                    continue
                sent += 1
            except Exception as exc:  # one bad address must not block the rest
                log.warning("delivery to %s failed: %s", sub.get("subId"), type(exc).__name__)
        return sent

    return notify


def handler(event: Optional[Dict[str, Any]], context: Any = None) -> Dict[str, Any]:
    event = event or {}
    subscriptions, alerts = _tables()
    keys = event.get("districts") or subscribed_districts(subscriptions)
    log.info("evaluating %d districts", len(keys))
    result = evaluate(keys, alerts, make_publisher(), override=event.get("forecast"), dry_run=bool(event.get("dry_run")),
                      notify=make_notifier(subscriptions))
    log.info("result: %s", result)
    return result
