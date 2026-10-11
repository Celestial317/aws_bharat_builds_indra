# Convenience wrapper. Everything here also works without make: see `python scripts/dev.py --help`.
# CONTAINER defaults to Finch (open source); use CONTAINER=docker if you prefer.
CONTAINER ?= finch
TAG ?= 2.0.0

.PHONY: setup up test ingest data validate images compose-up compose-aws k8s-eks-anywhere sam-build sam-local localstack clean

setup:      ; python scripts/dev.py setup
up:         ; python scripts/dev.py up
test:       ; python scripts/dev.py test
ingest:     ; python scripts/dev.py ingest
data:       ; python scripts/build_climate_data.py        # rebuild the climate atlas from data/raw
validate:   ; python scripts/validate_deploy.py

# ---- containers (Finch) ---------------------------------------------------------------
images:
	$(CONTAINER) build -f backend/Dockerfile  -t indra/backend:$(TAG)   .
	$(CONTAINER) build -f frontend/Dockerfile -t indra/frontend:$(TAG)  .
	$(CONTAINER) build -t indra/telemetry:$(TAG) services/telemetry

compose-up:  ; $(CONTAINER) compose up --build
compose-aws: ; $(CONTAINER) compose --profile aws up --build

# ---- Kubernetes: EKS Anywhere (Docker provider = real EKS Distro on your laptop) -------
k8s-eks-anywhere:
	eksctl anywhere create cluster -f deploy/eks-anywhere/cluster-docker.yaml
	kubectl apply -k deploy/k8s/overlays/eks-anywhere

# ---- serverless: SAM + LocalStack ------------------------------------------------------
sam-build:  ; cd serverless && sam build
sam-local:  ; cd serverless && sam local invoke RiskEvaluatorFunction --event events/heavy-rain-pune.json
localstack:
	$(CONTAINER) compose --profile aws up -d localstack
	python scripts/localstack_bootstrap.py --demo

clean:
	rm -rf frontend/dist services/telemetry/out serverless/.aws-sam .pytest_cache
