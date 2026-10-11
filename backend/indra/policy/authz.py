"""Cedar-backed authorization.

``authorize`` builds a tiny entity graph for the request (principal + resource), evaluates the
policies in ``policies.cedar`` with the Cedar engine (``cedarpy``) and raises 403 on deny.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

import cedarpy

from ..core.errors import AppError
from ..core.logging import get_logger
from ..core.security import Principal

log = get_logger("authz")
POLICY_PATH = Path(__file__).with_name("policies.cedar")


@lru_cache(maxsize=1)
def load_policies() -> str:
    return POLICY_PATH.read_text(encoding="utf-8")


def _ref(entity_type: str, entity_id: str) -> Dict[str, Any]:
    return {"__entity": {"type": entity_type, "id": entity_id}}


def _entities(principal: Principal, resource_type: str, resource_id: str,
              resource_attrs: Optional[Dict[str, Any]]) -> list:
    attrs: Dict[str, Any] = {}
    for key, value in (resource_attrs or {}).items():
        attrs[key] = _ref("User", value) if key == "owner" else value
    return [
        {"uid": {"type": "User", "id": principal.uid},
         "attrs": {"role": principal.role, "suspended": principal.suspended},
         "parents": []},
        {"uid": {"type": resource_type, "id": resource_id}, "attrs": attrs, "parents": []},
    ]


def is_allowed(principal: Principal, action: str, resource_type: str, resource_id: str = "*",
               resource_attrs: Optional[Dict[str, Any]] = None) -> bool:
    request = {
        "principal": f'User::"{principal.uid}"',
        "action": f'Action::"{action}"',
        "resource": f'{resource_type}::"{resource_id}"',
        "context": {},
    }
    result = cedarpy.is_authorized(request, load_policies(), _entities(principal, resource_type, resource_id, resource_attrs))
    allowed = result.decision == cedarpy.Decision.Allow
    log.debug("cedar %s %s %s::%s -> %s", principal.uid, action, resource_type, resource_id, allowed)
    return allowed


def authorize(principal: Principal, action: str, resource_type: str, resource_id: str = "*",
              resource_attrs: Optional[Dict[str, Any]] = None) -> None:
    """Raise a 403 :class:`AppError` unless Cedar permits the action."""
    if not is_allowed(principal, action, resource_type, resource_id, resource_attrs):
        raise AppError(403, f"Not permitted to {action} this {resource_type.lower()}.", "forbidden")
