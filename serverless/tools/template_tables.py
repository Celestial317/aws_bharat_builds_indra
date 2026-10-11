"""Read DynamoDB table definitions out of template.yaml so tests and LocalStack bootstrap never drift
from the deployed schema. (CloudFormation short-form tags like !Ref are resolved against parameter defaults.)"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import yaml

TEMPLATE = Path(__file__).resolve().parents[1] / "template.yaml"


class _Loader(yaml.SafeLoader):
    pass


def _tag(loader: _Loader, suffix: str, node: yaml.Node) -> Dict[str, Any]:
    if isinstance(node, yaml.ScalarNode):
        value: Any = loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node, deep=True)
    else:
        value = loader.construct_mapping(node, deep=True)
    return {f"!{suffix}": value}


_Loader.add_multi_constructor("!", _tag)


def load_template(path: Path = TEMPLATE) -> Dict[str, Any]:
    return yaml.load(path.read_text(encoding="utf-8"), Loader=_Loader)


def _resolve(value: Any, params: Dict[str, str]) -> Any:
    if isinstance(value, dict) and set(value) == {"!Ref"}:
        return params[value["!Ref"]]
    return value


def table_definitions(template: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
    """boto3 ``create_table`` kwargs for every AWS::DynamoDB::Table in the template."""
    template = template or load_template()
    params = {name: spec.get("Default") for name, spec in template.get("Parameters", {}).items()}
    tables = []
    for resource in template["Resources"].values():
        if resource["Type"] != "AWS::DynamoDB::Table":
            continue
        p = resource["Properties"]
        definition: Dict[str, Any] = {
            "TableName": _resolve(p["TableName"], params),
            "AttributeDefinitions": p["AttributeDefinitions"],
            "KeySchema": p["KeySchema"],
            "BillingMode": p.get("BillingMode", "PAY_PER_REQUEST"),
        }
        if p.get("GlobalSecondaryIndexes"):
            definition["GlobalSecondaryIndexes"] = p["GlobalSecondaryIndexes"]
        tables.append({"definition": definition, "ttl": p.get("TimeToLiveSpecification")})
    return tables


def topic_names(template: Dict[str, Any] | None = None) -> List[str]:
    template = template or load_template()
    return [r["Properties"]["TopicName"] for r in template["Resources"].values() if r["Type"] == "AWS::SNS::Topic"]
