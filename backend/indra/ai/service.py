"""Shared AI facade used by every feature module: one LLM client, one knowledge base.

Design rule: deterministic engines own the numbers; the LLM only adds narrative and design
suggestions. Callers catch :class:`AIUnavailable` and fall back to the deterministic result.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict, List, Optional

from ..config import get_settings
from ..core.logging import get_logger
from . import prompts
from .embeddings import Embedder
from .knowledge import KnowledgeBase, Passage
from .llm import LLMClient, LLMUnavailable, clean_text

log = get_logger("ai")


class AIUnavailable(LLMUnavailable):
    """Raised when LLM-generated content cannot be produced; callers use their fallback."""


class AIService:
    def __init__(self):
        self.settings = get_settings()
        self.llm = LLMClient(self.settings)
        self.embedder = Embedder(self.settings)
        self.knowledge = KnowledgeBase(self.settings, self.embedder)

    # ---- lifecycle --------------------------------------------------------------
    def warm_up(self) -> Dict[str, Any]:
        """Load the embedding model and local index so the first request is fast."""
        info = {"embeddings": self.embedder.available, "knowledge": self.knowledge.status()}
        if self.knowledge.local.exists():
            self.knowledge.local.load()
        return info

    async def aclose(self) -> None:
        await self.llm.aclose()

    def status(self) -> Dict[str, Any]:
        return {"llm_configured": self.llm.configured, "llm_available": self.llm.available,
                "llm_model": self.settings.llm_model, "knowledge": self.knowledge.status()}

    # ---- retrieval --------------------------------------------------------------
    async def search(self, query: str, k: Optional[int] = None) -> List[Passage]:
        return await self.knowledge.search(query, k)

    async def rag_context(self, query: str, k: int = 3, max_chars: int = 600) -> str:
        return await self.knowledge.context(query, k, max_chars)

    # ---- generation -------------------------------------------------------------
    async def text(self, prompt: str, *, system: Optional[str] = None, max_tokens: int = 400,
                   temperature: Optional[float] = None) -> str:
        try:
            return await self.llm.complete(prompt, system=system, max_tokens=max_tokens, temperature=temperature)
        except LLMUnavailable as exc:
            raise AIUnavailable(str(exc)) from exc

    async def generate_json(self, content_type: str, context: Dict[str, Any], rag_query: Optional[str] = None) -> Dict[str, Any]:
        rag = await self.rag_context(rag_query, k=3) if rag_query else ""
        prompt = prompts.build(content_type, context, rag)
        try:
            return await self.llm.complete_json(prompt)
        except LLMUnavailable as exc:
            raise AIUnavailable(f"{content_type}: {exc}") from exc

    async def bullet_list(self, prompt: str, limit: int, max_tokens: int = 300) -> List[str]:
        """Ask for one item per line and return clean, de-numbered lines."""
        import re

        reply = clean_text(await self.text(prompt, max_tokens=max_tokens))
        lines = []
        for raw in reply.splitlines():
            line = re.sub(r"^\s*(?:\d+[.)]|[-*•])\s*", "", raw).strip()
            if line:
                lines.append(line)
        if not lines:
            raise AIUnavailable("model returned no usable lines")
        return lines[:limit]


@lru_cache(maxsize=1)
def get_ai() -> AIService:
    return AIService()
