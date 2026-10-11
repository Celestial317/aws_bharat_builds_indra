"""PDF -> chunks -> embeddings -> knowledge index. Driven by ``scripts/ingest_knowledge.py``."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Iterator, List, Tuple

from ..core.logging import get_logger

log = get_logger("ingest")

CHUNK_CHARS = 900
OVERLAP_CHARS = 150
MIN_CHUNK_CHARS = 120


def split_text(text: str, size: int = CHUNK_CHARS, overlap: int = OVERLAP_CHARS) -> List[str]:
    """Sentence-aware splitter: packs sentences into ~``size`` chunks with ``overlap`` carry-over."""
    text = re.sub(r"[\ue000-\uf8ff\ufffd\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    sentences = re.split(r"(?<=[.!?])\s+|\n\n", text)
    chunks: List[str] = []
    current = ""
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        while len(sentence) > size:  # pathological run-on text
            head, sentence = sentence[:size], sentence[size:]
            if current:
                chunks.append(current)
                current = ""
            chunks.append(head)
        if len(current) + len(sentence) + 1 > size and current:
            chunks.append(current)
            current = current[-overlap:] + " " + sentence if overlap else sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current)
    return [c.strip() for c in chunks if len(c.strip()) >= MIN_CHUNK_CHARS]


def iter_pdf_pages(path: Path) -> Iterator[Tuple[int, str]]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    for number, page in enumerate(reader.pages, start=1):
        try:
            yield number, page.extract_text() or ""
        except Exception as exc:  # damaged page
            log.warning("%s p.%d unreadable: %s", path.name, number, exc)


def load_chunks(directory: Path) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    chunks: List[Dict[str, Any]] = []
    per_file: Dict[str, int] = {}
    for pdf in sorted(directory.glob("*.pdf")):
        before = len(chunks)
        try:
            for page_no, text in iter_pdf_pages(pdf):
                for piece in split_text(text):
                    chunks.append({"text": piece, "source": pdf.name, "page": page_no})
        except Exception as exc:
            log.error("skipping %s: %s", pdf.name, exc)
        per_file[pdf.name] = len(chunks) - before
    return chunks, per_file
