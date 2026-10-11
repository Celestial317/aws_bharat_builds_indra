"""Chat endpoints (urban + rural personas), backed by the Strands agent with RAG/offline fallbacks."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..ai.agents import chat

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


class ChatTurn(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1500)
    history: Optional[List[ChatTurn]] = Field(None, max_length=12)


class ChatResponse(BaseModel):
    response: str
    mode: str = Field(description="agent | rag | offline - how the answer was produced")
    sources: List[Dict[str, Any]] = []
    tools_used: List[str] = []


async def _reply(persona: str, req: ChatRequest) -> ChatResponse:
    history = [t.model_dump() for t in req.history] if req.history else None
    result = await chat(persona, req.message.strip(), history)
    return ChatResponse(response=result.reply, mode=result.mode, sources=result.sources, tools_used=result.tools_used)


@router.post("/standard", response_model=ChatResponse)
async def standard(req: ChatRequest) -> ChatResponse:
    return await _reply("standard", req)


@router.post("/rural", response_model=ChatResponse)
async def rural(req: ChatRequest) -> ChatResponse:
    return await _reply("rural", req)
