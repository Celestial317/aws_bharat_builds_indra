"""Evaluator tests against moto (an in-process AWS emulator): real boto3 calls, no AWS account."""

import json
import os
import sys
import time
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "serverless"))
sys.path.insert(0, str(ROOT / "serverless" / "functions" / "risk_evaluator"))
sys.path.insert(0, str(ROOT / "packages" / "indra_climate"))

from tools.template_tables import load_template, table_definitions, topic_names  # noqa: E402

HEAVY_RAIN = json.loads((ROOT / "serverless" / "events" / "heavy-rain-pune.json").read_text())
HEATWAVE = json.loads((ROOT / "serverless" / "events" / "heatwave-jaipur.json").read_text())


@pytest.fixture
def aws(monkeypatch):
    for k, v in {"AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test", "AWS_DEFAULT_REGION": "ap-south-1",
                 "FORECAST_ENABLED": "false"}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("AWS_ENDPOINT_URL", raising=False)
    with mock_aws():
        ddb = boto3.client("dynamodb")
        for table in table_definitions():
            ddb.create_table(**table["definition"])
        sns = boto3.client("sns")
        topic_arn = sns.create_topic(Name=topic_names()[0])["TopicArn"]
        sqs = boto3.client("sqs")
        queue_url = sqs.create_queue(QueueName="capture")["QueueUrl"]
        queue_arn = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
        sns.subscribe(TopicArn=topic_arn, Protocol="sqs", Endpoint=queue_arn)
        monkeypatch.setenv("SUBSCRIPTIONS_TABLE", "IndraSubscriptions")
        monkeypatch.setenv("ALERTS_TABLE", "IndraAlerts")
        monkeypatch.setenv("ALERT_TOPIC_ARN", topic_arn)
        import app
        yield app, boto3.resource("dynamodb"), sqs, queue_url


def subscribe(ddb, user, sub, key, channel, contact, hazards=None):
    item = {"userId": user, "subId": sub, "districtKey": key, "channel": channel, "contact": contact}
    if hazards:
        item["hazards"] = hazards
    ddb.Table("IndraSubscriptions").put_item(Item=item)


def sent_emails():
    from moto.core import DEFAULT_ACCOUNT_ID
    from moto.ses import ses_backends

    return ses_backends[DEFAULT_ACCOUNT_ID]["ap-south-1"].sent_messages


def messages(sqs, url):
    out = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10).get("Messages", [])
    return [json.loads(json.loads(m["Body"])["Message"]) for m in out]


def test_template_defines_the_tables_the_backend_uses():
    names = {t["definition"]["TableName"] for t in table_definitions()}
    assert names == {"IndraSubscriptions", "IndraAlerts"}
    subs = next(t for t in table_definitions() if t["definition"]["TableName"] == "IndraSubscriptions")
    assert [k["AttributeName"] for k in subs["definition"]["KeySchema"]] == ["userId", "subId"]
    assert load_template()["Resources"]["RiskEvaluatorFunction"]["Properties"]["Handler"] == "app.handler"


def test_heavy_rain_creates_stored_and_published_alert(aws):
    app, ddb, sqs, url = aws
    result = app.handler(HEAVY_RAIN)
    assert result["evaluated"] == 1 and result["published"] >= 1
    stored = ddb.Table("IndraAlerts").scan()["Items"]
    flood = [a for a in stored if a["type"] == "flood"]
    assert flood and flood[0]["level"] == "warning" and flood[0]["districtKey"] == "Maharashtra|Pune"
    assert flood[0]["expiresAt"] > time.time()
    assert any(m["type"] == "flood" and m["district"] == "Pune" for m in messages(sqs, url))


def test_heatwave_critical(aws):
    app, ddb, *_ = aws
    app.handler(HEATWAVE)
    levels = {(a["type"], a["level"]) for a in ddb.Table("IndraAlerts").scan()["Items"]}
    assert ("heat", "critical") in levels


def test_duplicate_alerts_are_suppressed(aws):
    app, ddb, *_ = aws
    first = app.handler(HEAVY_RAIN)
    second = app.handler(HEAVY_RAIN)
    assert first["published"] >= 1 and second["published"] == 0
    assert second["skipped_duplicates"] == first["published"]


def test_dry_run_writes_nothing(aws):
    app, ddb, *_ = aws
    result = app.handler({**HEAVY_RAIN, "dry_run": True})
    assert result["alerts"] >= 1 and result["published"] == 0
    assert ddb.Table("IndraAlerts").scan()["Items"] == []


def test_defaults_to_subscribed_districts(aws):
    app, ddb, *_ = aws
    subs = ddb.Table("IndraSubscriptions")
    subs.put_item(Item={"userId": "u1", "subId": "s1", "districtKey": "Maharashtra|Pune"})
    subs.put_item(Item={"userId": "u2", "subId": "s2", "districtKey": "Maharashtra|Pune"})
    subs.put_item(Item={"userId": "u3", "subId": "s3", "districtKey": "Rajasthan|Jaipur"})
    assert app.subscribed_districts(subs) == ["Maharashtra|Pune", "Rajasthan|Jaipur"]
    assert app.handler({})["evaluated"] == 2


def test_unknown_district_is_reported_not_fatal(aws):
    app, *_ = aws
    result = app.handler({"districts": ["Nowhere|Atlantis", "Maharashtra|Pune"], "forecast": HEAVY_RAIN["forecast"]})
    assert result["unknown"] == ["Nowhere|Atlantis"] and result["evaluated"] == 1


def test_backend_dynamo_store_reads_what_the_lambda_wrote(aws, monkeypatch):
    """Contract test: the FastAPI DynamoStore and the Lambda share one schema."""
    app, ddb, *_ = aws
    app.handler(HEAVY_RAIN)
    sys.path.insert(0, str(ROOT / "backend"))
    monkeypatch.setenv("ALERTS_BACKEND", "dynamodb")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    from indra.config import get_settings
    from indra.services.stores import DynamoStore

    get_settings.cache_clear()
    store = DynamoStore(get_settings())
    alerts = store.list_alerts("Maharashtra|Pune")
    assert alerts and alerts[0]["type"] in {"flood", "heat", "drought"}
    sub = store.add_subscription("u9", {"districtKey": "Maharashtra|Pune", "district": "Pune", "state": "Maharashtra",
                                        "channel": "email", "contact": "x@y.z"})
    assert app.subscribed_districts(ddb.Table("IndraSubscriptions")) == ["Maharashtra|Pune"]
    assert store.get_subscription("u9", sub["subId"])["contact"] == "x@y.z"
    store.delete_subscription("u9", sub["subId"])
    assert store.list_subscriptions("u9") == []


# ----------------------------------------------------------------------------- per-subscriber delivery
def test_email_subscribers_of_the_district_are_notified(aws, monkeypatch):
    app, ddb, *_ = aws
    boto3.client("ses").verify_email_identity(EmailAddress="alerts@indra.example")
    monkeypatch.setenv("SES_SENDER", "alerts@indra.example")
    subscribe(ddb, "u1", "s1", "Maharashtra|Pune", "email", "asha@example.org")
    subscribe(ddb, "u2", "s2", "Maharashtra|Pune", "email", "ravi@example.org", hazards=["heat"])   # not interested in flood
    subscribe(ddb, "u3", "s3", "Rajasthan|Jaipur", "email", "far@example.org")                      # other district
    result = app.handler(HEAVY_RAIN)
    recipients = {d for m in sent_emails() for d in m.destinations["ToAddresses"]}
    assert recipients == {"asha@example.org"}
    assert result["notified"] >= 1
    assert "Pune" in sent_emails()[0].subject and "What to do" in sent_emails()[0].body


def test_sms_subscribers_are_notified(aws):
    app, ddb, *_ = aws
    subscribe(ddb, "u1", "s1", "Maharashtra|Pune", "sms", "+919800000001")
    assert app.handler(HEAVY_RAIN)["notified"] >= 1


def test_email_skipped_without_verified_sender(aws):
    app, ddb, *_ = aws
    subscribe(ddb, "u1", "s1", "Maharashtra|Pune", "email", "asha@example.org")
    assert app.handler(HEAVY_RAIN)["notified"] == 0           # SES_SENDER unset: skip, never crash
    assert sent_emails() == []


def test_one_bad_recipient_does_not_block_the_rest(aws, monkeypatch):
    app, ddb, *_ = aws
    boto3.client("ses").verify_email_identity(EmailAddress="alerts@indra.example")
    monkeypatch.setenv("SES_SENDER", "alerts@indra.example")
    subscribe(ddb, "u1", "s1", "Maharashtra|Pune", "sms", "not-a-phone-number")
    subscribe(ddb, "u2", "s2", "Maharashtra|Pune", "email", "ok@example.org")
    result = app.handler(HEAVY_RAIN)
    assert {d for m in sent_emails() for d in m.destinations["ToAddresses"]} == {"ok@example.org"}
    assert result["notified"] >= 1


def test_duplicates_do_not_renotify(aws, monkeypatch):
    app, ddb, *_ = aws
    boto3.client("ses").verify_email_identity(EmailAddress="alerts@indra.example")
    monkeypatch.setenv("SES_SENDER", "alerts@indra.example")
    subscribe(ddb, "u1", "s1", "Maharashtra|Pune", "email", "asha@example.org")
    app.handler(HEAVY_RAIN)
    count = len(sent_emails())
    app.handler(HEAVY_RAIN)
    assert len(sent_emails()) == count
