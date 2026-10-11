"""Build the RAG knowledge index from the PDFs in data/knowledge/.

Always writes the local index (data/index/knowledge.{npz,jsonl}); if OPENSEARCH_URL is set and
reachable it also (re)creates the k-NN index and bulk-loads it.

Usage:
    python scripts/ingest_knowledge.py                 # local (+ OpenSearch if configured)
    python scripts/ingest_knowledge.py --keep-index    # append to an existing OpenSearch index
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "packages" / "indra_climate"))

from indra.ai.embeddings import Embedder  # noqa: E402
from indra.ai.ingest import load_chunks  # noqa: E402
from indra.ai.knowledge import KnowledgeBase  # noqa: E402
from indra.core.logging import configure_logging  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default=str(ROOT / "data" / "knowledge"))
    parser.add_argument("--keep-index", action="store_true", help="do not recreate the OpenSearch index")
    args = parser.parse_args()
    configure_logging("INFO")

    started = time.time()
    chunks, per_file = load_chunks(Path(args.source))
    if not chunks:
        print(f"No text extracted from PDFs in {args.source}")
        return 1
    for name, count in per_file.items():
        print(f"  {count:5d} chunks  {name}")
    print(f"Embedding {len(chunks)} chunks ...")
    embedder = Embedder()
    if not embedder.available:
        print("Embedding model could not be loaded - aborting (see backend/models or network access).")
        return 2
    vectors = embedder.encode([c["text"] for c in chunks])
    report = KnowledgeBase(embedder=embedder).build(chunks, vectors, recreate=not args.keep_index)
    print(f"Done in {time.time() - started:.0f}s: {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
