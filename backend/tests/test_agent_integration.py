"""Run the real Strands agent loop against a fake OpenAI-compatible streaming server.

Proves the wiring end to end: model asks for the climate_risk tool -> our tool runs on the real
climate engine -> model writes the final answer from the tool result.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from indra.ai import agents
from indra.config import get_settings

pytestmark = pytest.mark.skipif(not agents.STRANDS_AVAILABLE, reason="strands-agents not installed")


def sse(chunks):
    return "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"


def chunk(delta, finish=None):
    return {"id": "x", "object": "chat.completion.chunk", "created": 0, "model": "fake",
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}


class FakeLLM(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeLLM.seen.append(body)
        roles = [m["role"] for m in body["messages"]]
        if "tool" not in roles:
            tool_call = {"index": 0, "id": "call_1", "type": "function",
                         "function": {"name": "climate_risk", "arguments": json.dumps({"place": "Jaisalmer"})}}
            payload = sse([chunk({"role": "assistant", "tool_calls": [tool_call]}), chunk({}, "tool_calls")])
        else:
            tool_text = next(m["content"] for m in body["messages"] if m["role"] == "tool")
            text = "Drought risk is high" if "drought" in str(tool_text).lower() else "no data"
            payload = sse([chunk({"role": "assistant", "content": text}), chunk({}, "stop")])
        data = payload.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


@pytest.fixture
def fake_llm(monkeypatch):
    server = HTTPServer(("127.0.0.1", 0), FakeLLM)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("LLM_BASE_URL", f"http://127.0.0.1:{server.server_port}/v1")
    monkeypatch.setenv("LLM_API_KEY", "test")
    monkeypatch.setenv("LLM_MODEL", "fake")
    get_settings.cache_clear()
    from indra.ai.service import get_ai

    get_ai.cache_clear()
    FakeLLM.seen.clear()
    yield
    server.shutdown()
    get_settings.cache_clear()
    get_ai.cache_clear()


async def test_strands_agent_calls_tool_and_answers(fake_llm):
    result = await agents.chat("standard", "Should I worry about drought in Jaisalmer?")
    assert result.mode == "agent", result
    assert result.reply == "Drought risk is high"
    assert "climate_risk" in result.tools_used
    first = FakeLLM.seen[0]
    assert {t["function"]["name"] for t in first["tools"]} == {"climate_risk", "rwh_potential", "knowledge_search"}
    assert first["messages"][0]["role"] == "system" and "INDRA" in first["messages"][0]["content"]
    tool_msg = next(m for m in FakeLLM.seen[1]["messages"] if m["role"] == "tool")
    assert "Jaisalmer" in str(tool_msg["content"])        # real tool output reached the model


async def test_agent_failure_falls_back_to_offline(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:9/v1")   # nothing listening
    monkeypatch.setenv("LLM_API_KEY", "test")
    monkeypatch.setenv("MAX_RETRIES", "1")
    get_settings.cache_clear()
    from indra.ai.service import get_ai

    get_ai.cache_clear()
    try:
        result = await agents.chat("standard", "How much rain does Pune get?")
        assert result.mode == "offline" and result.reply
    finally:
        get_settings.cache_clear()
        get_ai.cache_clear()
