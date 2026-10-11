"""Who is calling? Resolves a :class:`Principal` from a Firebase ID token (or demo header in dev).

Roles: ``droplet`` (default user), ``leader``, ``admin``. In ``firebase`` mode the role comes from
the token's ``role`` custom claim (or ``ADMIN_UIDS``). ``demo`` mode trusts the ``X-Demo-User``
header and is for local development only - the app refuses to start in production with it.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Optional

from fastapi import Header

from ..config import get_settings
from .errors import AppError
from .logging import get_logger

log = get_logger("security")
ROLES = {"droplet", "leader", "admin"}


@dataclass(frozen=True)
class Principal:
    uid: str
    role: str = "droplet"
    email: Optional[str] = None
    name: Optional[str] = None
    suspended: bool = False


_firebase_ready = False


def _init_firebase() -> None:
    global _firebase_ready
    if _firebase_ready:
        return
    import firebase_admin

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": get_settings().firebase_project_id})
    _firebase_ready = True


def _verify_token(token: str) -> Principal:
    from firebase_admin import auth

    _init_firebase()
    try:
        claims = auth.verify_id_token(token)
    except Exception as exc:  # expired, malformed, wrong project, offline cert fetch ...
        log.info("token rejected: %s", type(exc).__name__)
        raise AppError(401, "Invalid or expired sign-in token.") from exc
    uid = claims["uid"]
    role = claims.get("role") if claims.get("role") in ROLES else "droplet"
    if uid in get_settings().admin_uids:
        role = "admin"
    return Principal(uid=uid, role=role, email=claims.get("email"), name=claims.get("name"),
                     suspended=bool(claims.get("suspended")))


async def get_optional_principal(
    authorization: Optional[str] = Header(default=None),
    x_demo_user: Optional[str] = Header(default=None),
) -> Optional[Principal]:
    settings = get_settings()
    if settings.effective_auth_mode == "demo":
        if not x_demo_user:
            return None
        uid = x_demo_user.strip()[:128]
        return Principal(uid=uid, role="admin" if uid in settings.admin_uids else "droplet", name=uid)
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppError(401, "Use 'Authorization: Bearer <token>'.")
    return await asyncio.to_thread(_verify_token, token)


async def get_principal(
    authorization: Optional[str] = Header(default=None),
    x_demo_user: Optional[str] = Header(default=None),
) -> Principal:
    principal = await get_optional_principal(authorization, x_demo_user)
    if principal is None:
        raise AppError(401, "Sign in to use this feature.")
    return principal
