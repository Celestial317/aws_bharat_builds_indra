"""RAG knowledge base: OpenSearch k-NN when configured, otherwise a local on-disk index.

Both back-ends hold the same chunks (text, source PDF, page) embedded with MiniLM. If the embedding
model cannot load, search degrades to keyword (TF-IDF style) scoring so answers still ground in the
documents. ``KnowledgeBase.search`` never raises - an empty list means "no grounding available".
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import numpy as np

from ..config import Settings, get_settings
from ..core.logging import get_logger
from .embeddings import DIM, Embedder

log = get_logger("knowledge")

_JUNK = re.compile(r"[\ue000-\uf8ff\ufffd\x00-\x08\x0b\x0c\x0e-\x1f]")
_TOKEN = re.compile(r"[a-z0-9]{3,}")
_STOP = frozenset("the and for with that this from are was were have has had not but can will which their there been "
                  "into than then them these those such any all may use used using also more most other some".split())


@dataclass
class Passage:
    text: str
    source: str = ""
    page: Optional[int] = None
    score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {"text": self.text, "source": self.source, "page": self.page, "score": round(self.score, 4)}


def clean_chunk(text: str) -> str:
    """Drop PDF extraction debris (private-use glyphs, control characters)."""
    return re.sub(r"[ \t]{2,}", " ", _JUNK.sub("", text))


def tokenize(text: str) -> List[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


class LocalIndex:
    """``<path>.npz`` (vectors) + ``<path>.jsonl`` (chunk metadata)."""

    def __init__(self, base_path: str):
        self.base = Path(base_path)
        self.vectors: Optional[np.ndarray] = None
        self.chunks: List[Dict[str, Any]] = []
        self._df: Counter = Counter()
        self._tf: List[Counter] = []
        self.loaded = False

    @property
    def vec_path(self) -> Path:
        return self.base.with_suffix(".npz")

    @property
    def meta_path(self) -> Path:
        return self.base.with_suffix(".jsonl")

    def exists(self) -> bool:
        return self.vec_path.exists() and self.meta_path.exists()

    def load(self) -> bool:
        if self.loaded:
            return True
        if not self.exists():
            return False
        self.vectors = np.load(self.vec_path)["vectors"].astype(np.float32)
        with self.meta_path.open(encoding="utf-8") as fh:
            self.chunks = [json.loads(line) for line in fh if line.strip()]
        if len(self.chunks) != len(self.vectors):
            log.error("local index corrupt: %d chunks vs %d vectors", len(self.chunks), len(self.vectors))
            self.chunks, self.vectors = [], None
            return False
        self._tf = [Counter(tokenize(c["text"])) for c in self.chunks]
        self._df = Counter(t for tf in self._tf for t in tf)
        self.loaded = True
        log.info("local knowledge index loaded: %d chunks", len(self.chunks))
        return True

    def save(self, chunks: List[Dict[str, Any]], vectors: np.ndarray) -> None:
        self.base.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(self.vec_path, vectors=vectors.astype(np.float16))
        with self.meta_path.open("w", encoding="utf-8") as fh:
            for chunk in chunks:
                fh.write(json.dumps(chunk, ensure_ascii=False) + "\n")
        self.loaded = False

    def search_vector(self, query_vec: np.ndarray, k: int) -> List[Passage]:
        scores = self.vectors @ query_vec
        top = np.argsort(-scores)[:k]
        return [self._passage(int(i), float(scores[i])) for i in top]

    def search_keywords(self, query: str, k: int) -> List[Passage]:
        terms = set(tokenize(query))
        if not terms:
            return []
        n = len(self.chunks)
        scored = []
        for i, tf in enumerate(self._tf):
            score = sum((1 + math.log(tf[t])) * math.log(1 + n / (1 + self._df[t])) for t in terms if t in tf)
            if score > 0:
                scored.append((score / math.sqrt(sum(tf.values()) or 1), i))
        scored.sort(reverse=True)
        return [self._passage(i, s) for s, i in scored[:k]]

    def _passage(self, i: int, score: float) -> Passage:
        c = self.chunks[i]
        return Passage(text=clean_chunk(c["text"]), source=c.get("source", ""), page=c.get("page"), score=score)


class OpenSearchStore:
    """k-NN vector search on OpenSearch (HNSW, cosine, Lucene engine)."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from opensearchpy import OpenSearch

            url = self.settings.opensearch_url
            auth = (self.settings.opensearch_user, self.settings.opensearch_password) if self.settings.opensearch_user else None
            self._client = OpenSearch(hosts=[url], http_auth=auth, use_ssl=url.startswith("https"),
                                      verify_certs=False, ssl_show_warn=False, timeout=6, max_retries=1)
        return self._client

    def healthy(self) -> bool:
        try:
            return bool(self.client.ping())
        except Exception:
            return False

    def count(self) -> int:
        try:
            return int(self.client.count(index=self.settings.opensearch_index)["count"])
        except Exception:
            return 0

    def ensure_index(self, recreate: bool = False) -> None:
        index = self.settings.opensearch_index
        exists = self.client.indices.exists(index=index)
        if exists and recreate:
            self.client.indices.delete(index=index)
            exists = False
        if not exists:
            self.client.indices.create(index=index, body={
                "settings": {"index": {"knn": True}},
                "mappings": {"properties": {
                    "embedding": {"type": "knn_vector", "dimension": DIM, "method": {
                        "name": "hnsw", "space_type": "cosinesimil", "engine": "lucene"}},
                    "text": {"type": "text"},
                    "source": {"type": "keyword"},
                    "page": {"type": "integer"},
                }}})

    def bulk_index(self, chunks: List[Dict[str, Any]], vectors: np.ndarray) -> int:
        from opensearchpy import helpers

        actions = ({"_index": self.settings.opensearch_index, "_source": {
            "text": c["text"], "source": c.get("source", ""), "page": c.get("page"),
            "embedding": vectors[i].astype(float).tolist()}} for i, c in enumerate(chunks))
        ok, _ = helpers.bulk(self.client, actions, chunk_size=200, request_timeout=60)
        self.client.indices.refresh(index=self.settings.opensearch_index)
        return ok

    def search_vector(self, vec: np.ndarray, k: int) -> List[Passage]:
        body = {"size": k, "_source": ["text", "source", "page"],
                "query": {"knn": {"embedding": {"vector": vec.astype(float).tolist(), "k": k}}}}
        return self._hits(self.client.search(index=self.settings.opensearch_index, body=body))

    def search_keywords(self, query: str, k: int) -> List[Passage]:
        body = {"size": k, "_source": ["text", "source", "page"], "query": {"match": {"text": query}}}
        return self._hits(self.client.search(index=self.settings.opensearch_index, body=body))

    @staticmethod
    def _hits(result: Dict[str, Any]) -> List[Passage]:
        out = []
        for hit in result.get("hits", {}).get("hits", []):
            src = hit["_source"]
            out.append(Passage(text=clean_chunk(src["text"]), source=src.get("source", ""), page=src.get("page"),
                               score=float(hit.get("_score") or 0.0)))
        return out


@dataclass
class KnowledgeBase:
    settings: Settings = field(default_factory=get_settings)
    embedder: Embedder = field(default_factory=Embedder)

    def __post_init__(self):
        self.local = LocalIndex(self.settings.knowledge_local_path)
        self.opensearch: Optional[OpenSearchStore] = OpenSearchStore(self.settings) if self.settings.opensearch_url else None
        self._os_ok: Optional[bool] = None
        self._os_checked = 0.0

    # ---- status -----------------------------------------------------------------
    def status(self) -> Dict[str, Any]:
        os_ok = self.opensearch.healthy() if self.opensearch else False
        return {
            "backend": self.active_backend(os_ok),
            "opensearch_configured": bool(self.opensearch),
            "opensearch_healthy": os_ok,
            "opensearch_docs": self.opensearch.count() if os_ok else 0,
            "local_index": self.local.exists(),
            "embedding_model": self.embedder.state,
        }

    def active_backend(self, os_ok: Optional[bool] = None) -> str:
        if self.opensearch and (os_ok if os_ok is not None else self.opensearch.healthy()):
            return "opensearch"
        return "local" if self.local.exists() else "none"

    # ---- search -----------------------------------------------------------------
    async def search(self, query: str, k: Optional[int] = None) -> List[Passage]:
        k = k or self.settings.rag_top_k
        try:
            return await asyncio.to_thread(self._search_sync, query, k)
        except Exception as exc:
            log.warning("knowledge search failed: %s", exc)
            return []

    def _search_sync(self, query: str, k: int) -> List[Passage]:
        semantic = self.embedder.available
        vec = self.embedder.encode([query])[0] if semantic else None
        if self.opensearch and self._opensearch_up():
            try:
                found = self.opensearch.search_vector(vec, k) if semantic else self.opensearch.search_keywords(query, k)
                if found:
                    return found
                log.info("OpenSearch index empty or no hits - trying local index (run scripts/ingest_knowledge.py)")
            except Exception as exc:
                log.warning("OpenSearch query failed, using local index: %s", exc)
                self._os_ok = False
        if not self.local.load():
            return []
        return self.local.search_vector(vec, k) if semantic else self.local.search_keywords(query, k)

    def _opensearch_up(self) -> bool:
        """Cached health check; a down cluster is re-probed every 30 s so we recover automatically."""
        now = time.monotonic()
        if self._os_ok is None or (not self._os_ok and now - self._os_checked > 30):
            self._os_ok = self.opensearch.healthy()
            self._os_checked = now
            if not self._os_ok:
                log.warning("OpenSearch unreachable at %s - using local index", self.settings.opensearch_url)
        return bool(self._os_ok)

    async def context(self, query: str, k: Optional[int] = None, max_chars: int = 600) -> str:
        passages = await self.search(query, k)
        return "\n\n".join(p.text[:max_chars] for p in passages)

    # ---- ingestion (used by scripts/ingest_knowledge.py) --------------------------
    def build(self, chunks: Iterable[Dict[str, Any]], vectors: np.ndarray, recreate: bool = True) -> Dict[str, Any]:
        chunks = list(chunks)
        self.local.save(chunks, vectors)
        report: Dict[str, Any] = {"local_chunks": len(chunks), "opensearch_indexed": 0}
        if self.opensearch:
            if self.opensearch.healthy():
                self.opensearch.ensure_index(recreate=recreate)
                report["opensearch_indexed"] = self.opensearch.bulk_index(chunks, vectors)
            else:
                report["opensearch_error"] = f"unreachable at {self.settings.opensearch_url}"
        return report
