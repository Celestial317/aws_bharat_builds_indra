"""Local sentence-embedding model (all-MiniLM-L6-v2, 384-d). Lazy, thread-safe, optional."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import List, Optional

import numpy as np

from ..config import Settings, get_settings
from ..core.logging import get_logger

log = get_logger("embeddings")
HF_FALLBACK_NAME = "sentence-transformers/all-MiniLM-L6-v2"
DIM = 384


class Embedder:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self._model = None
        self._failed = False
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        """True when the model can embed (loads it on first use - may take several seconds)."""
        return self._load() is not None

    @property
    def state(self) -> str:
        """Non-blocking: ``ready`` | ``failed`` | ``not_loaded``."""
        return "ready" if self._model is not None else "failed" if self._failed else "not_loaded"

    def _load(self):
        if self._model is not None or self._failed:
            return self._model
        with self._lock:
            if self._model is not None or self._failed:
                return self._model
            try:
                from sentence_transformers import SentenceTransformer

                path = self.settings.embedding_model_path
                name = path if Path(path).exists() else HF_FALLBACK_NAME
                self._model = SentenceTransformer(name, device="cpu")
                log.info("embedding model loaded from %s", name)
            except Exception as exc:  # missing weights, offline, no torch ...
                self._failed = True
                log.warning("embedding model unavailable (%s) - falling back to keyword search", exc)
        return self._model

    def encode(self, texts: List[str]) -> np.ndarray:
        """Unit-normalised float32 vectors, shape (n, 384)."""
        model = self._load()
        if model is None:
            raise RuntimeError("embedding model unavailable")
        vectors = model.encode(texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False)
        return np.asarray(vectors, dtype=np.float32)
