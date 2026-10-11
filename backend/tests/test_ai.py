import json

import httpx
import numpy as np
import pytest

from indra.ai import tools
from indra.ai.agents import chat
from indra.ai.ingest import split_text
from indra.ai.knowledge import KnowledgeBase, LocalIndex, clean_chunk, tokenize
from indra.ai.llm import LLMClient, LLMUnavailable, extract_json
from indra.config import Settings


def settings(**kw):
    base = dict(llm_api_key="k", llm_base_url="https://llm.test/v1", max_retries=3, retry_delay_s=0.0)
    return Settings(**{**base, **kw})


# ----------------------------------------------------------------------------- JSON extraction
@pytest.mark.parametrize("text,expected", [
    ('{"a": 1}', {"a": 1}),
    ('Sure! Here you go:\n```json\n{"a": [1, 2,],}\n```\nHope that helps', {"a": [1, 2]}),
    ('prefix {"a": {"b": "}"}} suffix', {"a": {"b": "}"}}),
    ('{"quote": "she said \\"hi\\""}', {"quote": 'she said "hi"'}),
])
def test_extract_json_tolerates_llm_noise(text, expected):
    assert extract_json(text) == expected


@pytest.mark.parametrize("text", ["", "no json here", '{"a": ', "[1, 2]"])
def test_extract_json_returns_none_when_unusable(text):
    assert extract_json(text) is None


# ----------------------------------------------------------------------------- LLM client
def client_with(handler, **kw):
    llm = LLMClient(settings(**kw))
    llm._client = httpx.AsyncClient(base_url="https://llm.test/v1", transport=httpx.MockTransport(handler))
    return llm


def ok(content):
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


async def test_llm_retries_transient_errors():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(503) if len(calls) < 3 else ok("Harvest every drop \U0001F327")

    assert await client_with(handler).complete("hi") == "Harvest every drop"   # emoji stripped
    assert len(calls) == 3


async def test_llm_does_not_retry_auth_errors():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(401)

    with pytest.raises(LLMUnavailable):
        await client_with(handler).complete("hi")
    assert len(calls) == 1


async def test_llm_circuit_opens_after_repeated_failures():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(500)

    llm = client_with(handler, max_retries=1)
    for _ in range(LLMClient.FAILURES_TO_OPEN):
        with pytest.raises(LLMUnavailable):
            await llm.complete("hi")
    assert not llm.available
    before = len(calls)
    with pytest.raises(LLMUnavailable, match="circuit"):
        await llm.complete("hi")
    assert len(calls) == before          # fails fast, no network call


async def test_llm_sends_system_prompt_and_model():
    seen = {}

    def handler(request):
        seen.update(json.loads(request.content))
        return ok("fine")

    await client_with(handler, llm_model="m-1").complete("question", system="be brief")
    assert seen["model"] == "m-1" and seen["messages"][0] == {"role": "system", "content": "be brief"}


async def test_llm_unconfigured_raises_cleanly():
    with pytest.raises(LLMUnavailable, match="not configured"):
        await LLMClient(settings(llm_api_key="", llm_base_url="https://x.test/v1")).complete("hi")


async def test_complete_json_rejects_prose():
    with pytest.raises(LLMUnavailable):
        await client_with(lambda r: ok("I cannot do that")).complete_json("hi")


# ----------------------------------------------------------------------------- knowledge base
class FakeEmbedder:
    """Deterministic bag-of-words embedder so retrieval can be tested without the real model."""
    VOCAB = ["flush", "diverter", "recharge", "pit", "wheat", "irrigation"]
    state = "ready"

    def __init__(self, available=True):
        self.available = available

    def encode(self, texts):
        out = np.zeros((len(texts), 384), dtype=np.float32)
        for i, t in enumerate(texts):
            for j, w in enumerate(self.VOCAB):
                out[i, j] = t.lower().count(w)
            norm = np.linalg.norm(out[i]) or 1.0
            out[i] /= norm
        return out


CHUNKS = [
    {"text": "A first flush diverter discards the dirty initial runoff from the roof before filling the tank.", "source": "handbook.pdf", "page": 3},
    {"text": "A recharge pit lets surplus monsoon runoff percolate into the aquifer.", "source": "guide.pdf", "page": 9},
    {"text": "Wheat needs irrigation at crown root initiation and flowering stages in rabi season.", "source": "crops.pdf", "page": 1},
]


@pytest.fixture
def kb(tmp_path):
    s = settings(knowledge_local_path=str(tmp_path / "idx"), opensearch_url="")
    base = KnowledgeBase(s, FakeEmbedder())
    base.local.save(CHUNKS, base.embedder.encode([c["text"] for c in CHUNKS]))
    return base


async def test_semantic_search_ranks_relevant_chunk_first(kb):
    top = await kb.search("how does a first flush diverter work", k=1)
    assert top[0].source == "handbook.pdf" and top[0].page == 3


async def test_keyword_fallback_when_embedder_unavailable(kb):
    kb.embedder = FakeEmbedder(available=False)
    top = await kb.search("wheat irrigation stages", k=1)
    assert top and top[0].source == "crops.pdf"


async def test_search_never_raises_without_any_index(tmp_path):
    empty = KnowledgeBase(settings(knowledge_local_path=str(tmp_path / "none")), FakeEmbedder())
    assert await empty.search("anything") == []
    assert empty.status()["backend"] == "none"


async def test_opensearch_outage_falls_back_to_local(kb):
    class Down:
        def healthy(self):
            return False

    kb.opensearch = Down()
    assert kb.status()["backend"] == "local"
    assert (await kb.search("recharge pit", k=1))[0].source == "guide.pdf"


async def test_opensearch_query_error_falls_back_to_local(kb):
    class Flaky:
        def healthy(self):
            return True

        def search_vector(self, *a):
            raise RuntimeError("shard failure")

    kb.opensearch = Flaky()
    assert (await kb.search("recharge pit", k=1))[0].source == "guide.pdf"


def test_local_index_rejects_mismatched_files(tmp_path):
    idx = LocalIndex(str(tmp_path / "bad"))
    idx.save(CHUNKS, np.zeros((2, 384), dtype=np.float32))
    assert idx.load() is False


def test_text_cleaning_and_tokenizing():
    assert clean_chunk("ab \x00c") == "ab c"
    assert tokenize("The first-flush diverter!") == ["first", "flush", "diverter"]


def test_splitter_respects_size_and_drops_crumbs():
    text = " ".join(f"Sentence number {i} talks about rainwater harvesting tanks and filters." for i in range(80))
    chunks = split_text(text, size=500, overlap=80)
    assert len(chunks) > 5 and all(len(c) <= 600 for c in chunks)
    assert split_text("too short") == []


# ----------------------------------------------------------------------------- tools + agent fallback
def test_find_place_in_text():
    assert tools.find_place_in_text("how much rain does Pune get in a year?") == "Pune"
    assert tools.find_place_in_text("my pincode is 600001") == "600001"
    assert tools.find_place_in_text("how do i size a tank") is None


def test_climate_summary_tool_handles_unknown_place():
    assert "error" in tools.climate_summary("Atlantis", live=False)
    assert tools.climate_summary("Pune", live=False)["scores"]["flood"]["level"]


def test_rwh_potential_tool():
    out = tools.rwh_potential("Pune", roof_area_sqm=80, members=5, roof_material="Metal")
    assert out["water_balance"]["annual_harvest_l"] > 0


async def test_chat_offline_fallback_uses_climate_engine():
    result = await chat("standard", "Is Jaisalmer at risk of drought?")
    assert result.mode == "offline"
    assert "Jaisalmer" in result.reply and "drought risk" in result.reply


async def test_chat_rural_offline_notice_is_hindi():
    result = await chat("rural", "Pune mein baarish kitni hoti hai")
    assert result.reply.startswith("AI model abhi offline hai")


async def test_chat_unknown_persona_defaults_to_standard():
    assert (await chat("martian", "hello there")).mode == "offline"
