# INDRA API.  Build from the repo root:  finch build -f backend/Dockerfile -t indra/backend .
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 INDRA_ENV=production HF_HOME=/opt/hf
WORKDIR /app

COPY packages/indra_climate packages/indra_climate
COPY backend/requirements.txt backend/requirements.txt
# CPU-only torch keeps the image ~1.5 GB smaller than the default CUDA wheels.
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu torch \
 && cd backend && pip install -r requirements.txt

# Bake the embedding model in so the container starts offline.
RUN python -c "from sentence_transformers import SentenceTransformer as S; S('sentence-transformers/all-MiniLM-L6-v2')"

COPY backend/indra backend/indra
COPY data/index data/index

RUN useradd --system --uid 10001 --home /app indra && mkdir -p data/runtime && chown -R indra /app/data/runtime /opt/hf
USER indra
WORKDIR /app/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=3).status==200 else 1)"
CMD ["uvicorn", "indra.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
