"""Thin async client for any OpenAI-compatible chat endpoint (OpenRouter, Ollama, vLLM, ...).

Features: shared connection pool, retry with backoff on 429/5xx/timeouts, a circuit breaker so
a dead provider fails fast instead of stalling every request, and tolerant JSON extraction.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any, Dict, List, Optional

import httpx

from ..config import Settings, get_settings
from ..core.logging import get_logger

log = get_logger("llm")

_EMOJI = re.compile("[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF"
                    "\U00002702-\U000027B0\U000024C2-\U0001F251\U0001F900-\U0001F9FF\U00002600-\U000026FF]+")


class LLMUnavailable(RuntimeError):
    """The model could not produce an answer (not configured, circuit open, or repeated failure)."""


def clean_text(text: str) -> str:
    """Strip emoji and collapse stray whitespace from model output."""
    return _EMOJI.sub("", text or "").strip()


def extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Pull the first balanced JSON object out of a model reply (handles ``` fences, trailing commas)."""
    if not text:
        return None
    body = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", body, re.DOTALL)
    if fence:
        body = fence.group(1)
    start = body.find("{")
    if start == -1:
        return None
    depth, in_str, escaped, end = 0, False, False, -1
    for i in range(start, len(body)):
        ch = body[i]
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        return None
    candidate = re.sub(r",(\s*[}\]])", r"\1", body[start:end + 1])
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


class LLMClient:
    FAILURES_TO_OPEN = 3
    COOLDOWN_S = 45.0

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self._client: Optional[httpx.AsyncClient] = None
        self._failures = 0
        self._open_until = 0.0

    @property
    def configured(self) -> bool:
        return self.settings.llm_configured

    @property
    def available(self) -> bool:
        return self.configured and time.monotonic() >= self._open_until

    def _http(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {"Content-Type": "application/json", "HTTP-Referer": "https://indra.local", "X-Title": "INDRA"}
            if self.settings.llm_api_key:
                headers["Authorization"] = f"Bearer {self.settings.llm_api_key}"
            self._client = httpx.AsyncClient(
                base_url=self.settings.llm_base_url.rstrip("/"), headers=headers,
                timeout=httpx.Timeout(self.settings.llm_timeout_s, connect=8.0))
        return self._client

    async def aclose(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def complete(self, prompt: str | List[Dict[str, str]], *, system: Optional[str] = None,
                       max_tokens: Optional[int] = None, temperature: Optional[float] = None) -> str:
        """Return the assistant text. Raises :class:`LLMUnavailable` when no answer can be produced."""
        if not self.configured:
            raise LLMUnavailable("LLM is not configured (set LLM_API_KEY / LLM_BASE_URL).")
        if time.monotonic() < self._open_until:
            raise LLMUnavailable("LLM provider temporarily unavailable (circuit open).")

        messages = prompt if isinstance(prompt, list) else [{"role": "user", "content": prompt}]
        if system:
            messages = [{"role": "system", "content": system}, *messages]
        payload = {
            "model": self.settings.llm_model,
            "messages": messages,
            "temperature": self.settings.llm_temperature if temperature is None else temperature,
            "max_tokens": max_tokens or self.settings.llm_max_tokens,
        }
        last: Optional[Exception] = None
        for attempt in range(1, self.settings.max_retries + 1):
            try:
                response = await self._http().post("/chat/completions", json=payload)
                if response.status_code in (429, 500, 502, 503, 504):
                    raise httpx.HTTPStatusError(f"{response.status_code}", request=response.request, response=response)
                response.raise_for_status()
                content = clean_text(response.json()["choices"][0]["message"].get("content") or "")
                if not content:
                    raise ValueError("empty completion")
                self._failures = 0
                return content
            except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
                last = exc
                status = getattr(getattr(exc, "response", None), "status_code", None)
                log.warning("LLM attempt %d/%d failed: %s %s", attempt, self.settings.max_retries,
                            type(exc).__name__, status or "")
                if status in (400, 401, 403, 404):  # not retryable
                    break
                if attempt < self.settings.max_retries:
                    await asyncio.sleep(self.settings.retry_delay_s * 2 ** (attempt - 1))
        self._failures += 1
        if self._failures >= self.FAILURES_TO_OPEN:
            self._open_until = time.monotonic() + self.COOLDOWN_S
            self._failures = 0
            log.error("LLM circuit opened for %.0fs", self.COOLDOWN_S)
        raise LLMUnavailable(f"LLM request failed: {type(last).__name__}")

    async def complete_json(self, prompt: str, *, max_tokens: Optional[int] = None) -> Dict[str, Any]:
        reply = await self.complete(prompt, max_tokens=max_tokens)
        parsed = extract_json(reply)
        if parsed is None:
            raise LLMUnavailable("Model reply was not valid JSON.")
        return parsed
