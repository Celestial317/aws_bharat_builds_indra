"""Request-id, access log, security headers and a small in-process rate limiter."""

from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .logging import get_logger, request_id_var

log = get_logger("http")

_AI_PREFIXES = ("/api/chatbot", "/api/agent", "/api/assessment/analyze", "/api/gramin/crop-suggestions",
                "/api/gramin/water-management/predict")
_QUIET_PATHS = {"/health", "/ready", "/"}


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_var.set(rid)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path not in _QUIET_PATHS:
            log.info("%s %s -> %s (%.0f ms)", request.method, request.url.path, response.status_code, elapsed_ms)
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limiter per client IP. Two buckets: general and AI-backed endpoints.

    In-process only: with several replicas each enforces its own window, which is fine as a
    safety net (put a gateway limiter in front for hard guarantees).
    """

    def __init__(self, app, general_per_minute: int, ai_per_minute: int):
        super().__init__(app)
        self.limits = {"general": general_per_minute, "ai": ai_per_minute}
        self.hits: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path in _QUIET_PATHS:
            return await call_next(request)
        bucket = "ai" if request.url.path.startswith(_AI_PREFIXES) else "general"
        limit = self.limits[bucket]
        if limit <= 0:
            return await call_next(request)
        client = request.client.host if request.client else "unknown"
        window = self.hits[(client, bucket)]
        now = time.monotonic()
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= limit:
            retry = max(1, int(60 - (now - window[0])))
            return JSONResponse(
                {"error": {"code": "rate_limited", "message": "Too many requests, slow down.",
                           "request_id": request_id_var.get()}},
                status_code=429, headers={"Retry-After": str(retry)})
        window.append(now)
        if len(self.hits) > 5000:  # bound memory
            for key in [k for k, v in self.hits.items() if not v or now - v[-1] > 60]:
                self.hits.pop(key, None)
        return await call_next(request)
