"""INDRA chat agents built on the Strands Agents SDK (open source, model-agnostic).

Three tiers so the assistant always answers:
  1. Strands agent with tools (climate risk, RWH potential, knowledge search) - best answers.
  2. Plain RAG completion - when the model/provider has no tool-calling support.
  3. Offline grounded answer from the knowledge base + climate engine - no LLM needed.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..config import get_settings
from ..core.logging import get_logger
from . import tools as T
from .llm import LLMUnavailable
from .service import get_ai

log = get_logger("agent")

try:  # Strands is optional at runtime: the chatbot degrades to tier 2/3 without it.
    from strands import Agent, tool
    from strands.models.openai import OpenAIModel
    STRANDS_AVAILABLE = True
except Exception as exc:  # pragma: no cover - import guard
    STRANDS_AVAILABLE = False
    log.warning("strands-agents not importable (%s); using RAG fallback", exc)

BASE_RULES = (
    "You are INDRA, an assistant for rainwater harvesting and water resilience in India: too much "
    "water in the monsoon, too little in the dry season, and heat in between. Be practical, specific "
    "and honest. Use tools for facts about a place (rainfall, flood/drought/heat risk, sizing) instead "
    "of guessing. If a tool returns an error or no data, say so. Never invent subsidy amounts or "
    "phone numbers. Plain text, no emoji, at most 90 words."
)
PERSONAS = {
    "standard": BASE_RULES + " Audience: urban households and housing societies - costs, ROI, tanks, "
                             "filtration, recharge pits, flood-proofing the plot.",
    "rural": BASE_RULES + " Audience: farmers and village councils - use simple words; reply in the "
                          "language the user writes in (Hindi/Hinglish welcome). Cover crops, "
                          "farm ponds, irrigation, cattle water, and surviving heat waves.",
}
OFFLINE_NOTICE = {
    "standard": "The AI model is offline right now. From the INDRA knowledge base:",
    "rural": "AI model abhi offline hai. INDRA gyaan-kosh se jaankari:",
}


@dataclass
class ChatResult:
    reply: str
    mode: str                      # agent | rag | offline
    sources: List[Dict[str, Any]] = field(default_factory=list)
    tools_used: List[str] = field(default_factory=list)


def _build_tools():
    @tool
    def climate_risk(place: str) -> dict:
        """Get flood, drought and heat risk scores, current season and active weather alerts.

        Args:
            place: District name, 'District, State', or 6-digit pincode (e.g. 'Pune' or '600001').
        """
        return _compact(T.climate_summary(place))

    @tool
    def rwh_potential(place: str, roof_area_sqm: float = 100.0, members: int = 4, roof_material: str = "RCC") -> dict:
        """Estimate rooftop rainwater harvest, recommended tank size and self-sufficiency days.

        Args:
            place: District name, 'District, State', or 6-digit pincode.
            roof_area_sqm: Roof catchment area in square metres.
            members: Number of people in the household.
            roof_material: One of RCC, Tiles, Metal, Asbestos, Thatch.
        """
        return T.rwh_potential(place, roof_area_sqm, members, roof_material)

    @tool
    def knowledge_search(query: str) -> list:
        """Search the rainwater-harvesting and agriculture reference library; returns cited passages.

        Args:
            query: What to look up, e.g. 'first flush diverter sizing' or 'rabi crops low water'.
        """
        return [{"text": p["text"][:500], "source": p["source"], "page": p["page"]} for p in T.knowledge_search(query)]

    return [climate_risk, rwh_potential, knowledge_search]


def _compact(report: Dict[str, Any]) -> Dict[str, Any]:
    """Trim a climate report to what the model needs (saves tokens)."""
    if "error" in report:
        return report
    return {
        "location": report["location"],
        "season": report["season"]["label"],
        "scores": {k: {"score": v["score"], "level": v["level"], "why": v["drivers"]} for k, v in report["scores"].items()},
        "swing_index": report["overall"]["swing_index"],
        "alerts": [f"{a['level'].upper()}: {a['title']} - {a['action']}" for a in report["alerts"][:4]],
        "rainfall_mm": report.get("rainfall_mm"),
        "groundwater_stage_pct": report.get("groundwater_stage_pct"),
        "data_basis": report["basis"],
    }


def _history_messages(history: Optional[List[Dict[str, str]]]) -> List[Dict[str, Any]]:
    out = []
    for item in (history or [])[-6:]:
        role = "assistant" if item.get("role") == "assistant" else "user"
        text = (item.get("content") or "")[:1000]
        if text:
            out.append({"role": role, "content": [{"text": text}]})
    return out


def _run_agent(mode: str, message: str, history: Optional[List[Dict[str, str]]]) -> ChatResult:
    settings = get_settings()
    model = OpenAIModel(
        client_args={"api_key": settings.llm_api_key or "not-needed", "base_url": settings.llm_base_url,
                     "timeout": settings.llm_timeout_s},
        model_id=settings.llm_model,
        params={"temperature": settings.llm_temperature, "max_tokens": 500},
    )
    agent = Agent(model=model, system_prompt=PERSONAS[mode], tools=_build_tools(),
                  messages=_history_messages(history), callback_handler=None)
    result = agent(message)
    text = str(result).strip()
    used = sorted({name for name in getattr(result.metrics, "tool_metrics", {}) or {}})
    if not text:
        raise LLMUnavailable("agent returned an empty reply")
    return ChatResult(reply=text, mode="agent", tools_used=used)


async def _rag_reply(mode: str, message: str) -> ChatResult:
    ai = get_ai()
    passages = await ai.search(message, k=3)
    context = "\n".join(p.text[:300] for p in passages)
    place = T.find_place_in_text(message)
    facts = ""
    if place:
        summary = await asyncio.to_thread(T.climate_summary, place, None, False)
        if "error" not in summary:
            facts = f"\nPLACE FACTS: {_compact(summary)}"
    prompt = f"Reference context:\n{context or 'none'}{facts}\n\nUser question: {message}\n\nAnswer:"
    reply = await ai.text(prompt, system=PERSONAS[mode], max_tokens=350)
    return ChatResult(reply=reply, mode="rag", sources=[p.to_dict() for p in passages])


async def _offline_reply(mode: str, message: str) -> ChatResult:
    ai = get_ai()
    passages = await ai.search(message, k=2)
    parts = [OFFLINE_NOTICE[mode]]
    place = T.find_place_in_text(message)
    if place:
        summary = await asyncio.to_thread(T.climate_summary, place, None, False)
        if "error" not in summary:
            s = summary["scores"]
            parts.append(f"{summary['location']['district']}: flood risk {s['flood']['level']}, drought risk "
                         f"{s['drought']['level']}, heat risk {s['heat']['level']}. Season: {summary['season']['label']}.")
    for p in passages:
        parts.append(f"- {p.text[:280].strip()} ({p.source}, p.{p.page})")
    if len(parts) == 1:
        parts.append("I could not find anything relevant offline. Please try again shortly.")
    return ChatResult(reply="\n".join(parts), mode="offline", sources=[p.to_dict() for p in passages])


async def chat(mode: str, message: str, history: Optional[List[Dict[str, str]]] = None) -> ChatResult:
    mode = mode if mode in PERSONAS else "standard"
    ai = get_ai()
    if ai.llm.available:
        if STRANDS_AVAILABLE:
            try:
                return await asyncio.to_thread(_run_agent, mode, message, history)
            except Exception as exc:
                log.warning("Strands agent failed (%s: %s); trying plain RAG", type(exc).__name__, str(exc)[:160])
        try:
            return await _rag_reply(mode, message)
        except LLMUnavailable as exc:
            log.warning("RAG completion failed: %s", exc)
    return await _offline_reply(mode, message)
