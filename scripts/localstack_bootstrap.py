"""Create the DynamoDB tables and SNS topic from serverless/template.yaml inside LocalStack (or any
AWS-compatible endpoint). Idempotent. Optionally invokes the evaluator once with a demo storm.

Usage:
    python scripts/localstack_bootstrap.py [--endpoint http://localhost:4566] [--demo]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "serverless"))
from tools.template_tables import table_definitions, topic_names  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--endpoint", default=os.getenv("AWS_ENDPOINT_URL", "http://localhost:4566"))
    parser.add_argument("--region", default=os.getenv("AWS_REGION", "ap-south-1"))
    parser.add_argument("--demo", action="store_true", help="run the evaluator once against a sample heavy-rain forecast")
    args = parser.parse_args()
    cfg = dict(endpoint_url=args.endpoint, region_name=args.region, aws_access_key_id="test", aws_secret_access_key="test")

    ddb, sns = boto3.client("dynamodb", **cfg), boto3.client("sns", **cfg)
    for table in table_definitions():
        name = table["definition"]["TableName"]
        try:
            ddb.create_table(**table["definition"])
            ddb.get_waiter("table_exists").wait(TableName=name)
            print(f"created table {name}")
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ResourceInUseException":
                raise
            print(f"table {name} already exists")
        if table["ttl"]:
            ddb.update_time_to_live(TableName=name, TimeToLiveSpecification=table["ttl"])
    topic_arn = ""
    for topic in topic_names():
        topic_arn = sns.create_topic(Name=topic)["TopicArn"]
        print(f"topic {topic_arn}")

    if args.demo:
        sys.path.insert(0, str(ROOT / "serverless" / "functions" / "risk_evaluator"))
        sys.path.insert(0, str(ROOT / "packages" / "indra_climate"))
        os.environ.update(AWS_ENDPOINT_URL=args.endpoint, AWS_DEFAULT_REGION=args.region, AWS_ACCESS_KEY_ID="test",
                          AWS_SECRET_ACCESS_KEY="test", SUBSCRIPTIONS_TABLE="IndraSubscriptions",
                          ALERTS_TABLE="IndraAlerts", ALERT_TOPIC_ARN=topic_arn, FORECAST_ENABLED="false")
        import app

        event = json.loads((ROOT / "serverless" / "events" / "heavy-rain-pune.json").read_text())
        print("demo evaluation:", app.handler(event))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
