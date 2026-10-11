# INDRA - water resilience for India

> **Too much water, too little of it, and the heat in between.**
> The monsoon floods the street; the summer dries the tap - often in the same place. INDRA reads both, then sizes the
> rooftop system, crop plan and tank alerts that survive them.

INDRA (Initiative for Drainage and Rainwater Acquisition) is a dual-mode platform: **INDRA** for households and housing
societies, **INDRA-Gramin** for farmers and village councils. Users are *Droplets*.

| | What you get |
|---|---|
| **Climate risk** | Flood, scarcity and heat scores for any of 754 districts / 19,000 pincodes, a live 7-day forecast, IMD-class alerts with "what to do", and a *flood-and-famine swing index* that finds places suffering both. |
| **Rooftop planner** | Cost, feasibility, tank size and system type (rooftop / recharge pit / hybrid) from your roof, budget and local rainfall - plus how many litres you keep off the street each monsoon. |
| **Gramin tools** | Daily water budget (people / cattle / fields), crop ranking by rupees-per-litre, community clustering. |
| **Tank monitor** | Register a sensor-equipped tank; get *hours until it overflows* in a cloudburst or *runs dry* in a heatwave. |
| **Assistant** | A Strands agent that calls the climate engine, the roof sizer and a cited document library instead of guessing. Answers offline too. |
| **Alerts** | Subscribe a district; a scheduled serverless function scores it every 3 h and emails / SMSes new alerts. |

---

## The AWS open-source toolkit, and where each piece lives

The brief: *use the open-source AWS tools - no AWS account, no card, no bill.* Everything below runs on a laptop.

| Need | Tool | How INDRA uses it | Where | Verified in this repo |
|---|---|---|---|---|
| Agents and AI | **Strands Agents SDK** | The chat assistant is a Strands agent with three tools (climate risk, RWH sizing, document search) on any OpenAI-compatible model. Falls back to plain RAG, then to an offline grounded answer. | `backend/indra/ai/agents.py`, `ai/tools.py` | Tests run the real agent loop against a fake streaming LLM, including the tool call round-trip and failure fallbacks |
| Agents and AI | **PartyRock** | Hosted-only playground, so it cannot be called from code. Two app blueprints (monsoon-ready household, heatwave water budget) are included for no-code prototyping; the production logic is the Strands agent. | `deploy/partyrock/` | Blueprints only |
| Containers | **Finch** | Dockerfiles + `compose.yaml` built and run with `finch` (or Docker). Non-root images, health checks, `make images`. | `backend/Dockerfile`, `frontend/Dockerfile`, `services/telemetry/Dockerfile`, `compose.yaml` | Statically validated (`scripts/validate_deploy.py`); images not built here (no container engine on the dev machine) |
| Kubernetes | **EKS Distro / EKS Anywhere** | Kustomize base + EKS Anywhere overlay (probes, limits, HPA, PDB, NetworkPolicy, non-root, read-only root FS where possible); EKS Anywhere Docker-provider cluster spec; kind config for EKS Distro node images. Uses only core APIs. | `deploy/k8s/`, `deploy/eks-anywhere/`, `deploy/eks-distro/` | Statically validated (selectors, probes, config refs, policies); not applied to a cluster here |
| Serverless | **SAM CLI** | `template.yaml` defines the scheduled risk-evaluator Lambda, DynamoDB tables and SNS topic. | `serverless/` | `cfn-lint` clean; Lambda logic tested against moto (13 tests); `sam build/local` not run here |
| Serverless | **LocalStack** | Local DynamoDB / SNS / SES / Lambda. `scripts/localstack_bootstrap.py` creates the tables from the SAM template (single source of truth); compose profile `aws`. | `scripts/localstack_bootstrap.py`, `compose.yaml` | Same code paths exercised through moto; LocalStack container not run here |
| Servers and runtimes | **Corretto** | The tank-telemetry service is Java 21 with zero dependencies, shipped on Corretto images. | `services/telemetry/` | 22 Java tests (JSON, analytics, full HTTP API); backend integration tests compile and run it |
| Servers and runtimes | **Firecracker** | Boot the telemetry service in a microVM so untrusted sensor traffic is hardware-isolated: rootfs builder, VM config, run script. Linux + KVM only. | `deploy/firecracker/` | Config and scripts linted; not booted (needs KVM) |
| Data and search | **OpenSearch** | RAG vector store (k-NN, HNSW, cosine) over 16 reference PDFs; auto-fallback to a local on-disk index when the cluster is down or empty. | `backend/indra/ai/knowledge.py`, `scripts/ingest_knowledge.py` | Retrieval, outage and error fallbacks tested with fakes; live cluster not run here |
| Auth and policy | **Cedar** | Every authorization decision (own tanks, own subscriptions, publish alerts, train models) is a Cedar policy, default-deny, evaluated by `cedarpy`. | `backend/indra/policy/policies.cedar`, `authz.py` | 20+ policy and API tests |
| The plumbing | - | - | - | - |

> Honesty note: this machine has no container engine, `sam`, KVM or Kubernetes. Everything those tools consume is
> validated statically and everything it feeds is tested in-process, but **the container images, cluster apply, `sam build`
> and the Firecracker boot have not been executed.** `python scripts/dev.py test` runs every check that can run anywhere.

---

## Quick start

### 1. Local development (no containers, no accounts)

Requires Python 3.12, Node 22, and (optional, for tank monitoring) a JDK 21+ such as [Amazon Corretto](https://aws.amazon.com/corretto/).

```bash
python scripts/dev.py setup     # deps, climate atlas, Java build, .env
python scripts/dev.py up        # telemetry :8090  +  API :8000  +  web :5173
```

Open http://localhost:5173. API docs: http://localhost:8000/docs. System status: http://localhost:8000/api/status.

With no keys the platform is fully functional (deterministic engines, offline knowledge-base answers). To enable LLM
enrichment add `LLM_API_KEY` (OpenRouter has free models) or point `LLM_BASE_URL` at a local Ollama.

Demo the tank monitor: sign in, then `python scripts/simulate_tank.py --owner <your-uid> --scenario both` streams a
cloudburst followed by a heatwave dry spell into a new tank.

### 2. Containers (Finch or Docker)

```bash
finch compose up --build                  # web :8080, API :8000, telemetry, OpenSearch
finch compose run --rm ingest             # load the PDFs into OpenSearch
finch compose --profile aws up --build    # + LocalStack and the alert pipeline demo
```

### 3. Kubernetes on EKS Anywhere (EKS Distro)

```bash
make images TAG=2.0.0                     # push to your registry; edit images in the overlay
eksctl anywhere create cluster -f deploy/eks-anywhere/cluster-docker.yaml
kubectl create namespace indra
kubectl -n indra create secret generic indra-secrets \
  --from-literal=LLM_API_KEY="$LLM_API_KEY" --from-literal=TELEMETRY_SERVICE_KEY="$(openssl rand -hex 24)"
kubectl apply -k deploy/k8s/overlays/eks-anywhere
```

### 4. Serverless alerts (SAM + LocalStack)

```bash
python scripts/localstack_bootstrap.py --demo   # tables + topic + a demo storm through the evaluator
cd serverless && sam build && sam local invoke RiskEvaluatorFunction --event events/heavy-rain-pune.json
```

### 5. Firecracker microVM (Linux + KVM)

```bash
TELEMETRY_SERVICE_KEY=$(openssl rand -hex 24) ./deploy/firecracker/build-rootfs.sh && ./deploy/firecracker/run.sh
```

---

## Architecture

```
 Browser (React + TS + Tailwind) ──/api──►  FastAPI  ──────────────┬─► indra_climate  (flood / drought / heat, water balance, alerts)
   Firebase Auth + Firestore (community)      │  Cedar policies     ├─► Strands agent ─► LLM (any OpenAI-compatible) + tools
                                              │  rate limit, req-id ├─► Knowledge base ─► OpenSearch k-NN  ⇄  local index
                                              │                     ├─► Alert store    ─► DynamoDB (LocalStack/AWS) ⇄ memory
                                              ▼                     └─► Telemetry svc  (Java 21 / Corretto, Firecracker-able)
                                         Cedar allow/deny                       ▲ sensors (X-Device-Key)
 EventBridge schedule ─► Lambda risk evaluator ─► DynamoDB alerts ─► SNS ─► SES email / SNS SMS to subscribers
                          (same indra_climate package, via SAM)
```

**Design rule: deterministic engines own the numbers; the LLM only adds narrative.** Cost, feasibility, tank size,
crop ranking, water budgets and every risk score are computed. A model can add a plan, advice or phrasing - and every
endpoint still returns a complete answer when it is unreachable (`ai_enhanced: false`).

### Repository layout

```
backend/              FastAPI app (indra/): routers, ai/, policy/, services/, core/  + tests
packages/indra_climate/   climate engine + atlas + forecast client (stdlib only; used by API and Lambda)
services/telemetry/   Java 21 tank-telemetry service + tests
serverless/           SAM template, risk-evaluator Lambda, sample events, moto tests
frontend/             React app (pages/urban, pages/gramin, pages/shared, components/climate)
deploy/               k8s/ (kustomize), eks-anywhere/, eks-distro/, firecracker/, partyrock/, docker/
scripts/              dev.py, build_climate_data.py, ingest_knowledge.py, localstack_bootstrap.py, simulate_tank.py, validate_deploy.py
data/                 knowledge/ (16 reference PDFs), index/ (built RAG index), raw/ (survey CSV, git-ignored)
compose.yaml  Makefile  .env.example
```

### API overview (full docs at `/docs`)

| Area | Endpoints |
|---|---|
| Climate | `GET /api/climate/risk` · `/alerts` · `/hotspots` · `/states` · `/districts` |
| Assessment | `POST /api/assessment/analyze` · `GET /api/assessment/master-data` |
| Gramin | `POST /api/gramin/water-management/predict` · `GET .../tips` · `POST /api/gramin/crop-suggestions` |
| Chat | `POST /api/chatbot/standard` · `/rural` |
| Alerts | `GET /api/alerts/feed` · `POST/GET/DELETE /api/alerts/subscriptions` · `POST /api/alerts/publish` (leader/admin) |
| Tanks | `POST/GET /api/tanks` · `GET /api/tanks/shared` · `GET/DELETE /api/tanks/{id}` |
| Community ML | `GET /api/community/clusters` · `POST .../clusters/predict` · `POST .../clusters/train` (admin) |
| Vendors | `GET /api/vendors/search` · `/diy-guide` |
| Ops | `GET /health` · `/ready` · `/api/status` |

Errors always look like `{"error": {"code", "message", "request_id"}}`.

---

## How the numbers are made

* **Rainfall and groundwater** come from `data/raw/Indra_Database.csv` (pincode-level survey). 754 districts: 298 observed,
  27 with IMD overrides, 414 inferred from the three nearest observed districts (inverse-distance weighted, max 450 km),
  15 from regional climatology (J&K, Ladakh, Andaman). Every response says which (`rainfall.source`, `data_confidence`).
* **Flood score (0-100)** - main-season rainfall (south-west *or* north-east monsoon, whichever is wetter), rain concentration,
  plus a live bump from the forecast using IMD classes (heavy >= 64.5, very heavy >= 115.6, extreme >= 204.5 mm/24 h).
* **Scarcity score** - half low annual rainfall, half groundwater stress (CGWB extraction stage).
* **Heat score** - forecast peak temperature when online; otherwise an *estimate* from aridity and latitude, labelled as such.
* **Swing index** - `min(flood, max(scarcity, heat))`: high only where both extremes bite.
* **Water balance** - harvest = roof area x rainfall x runoff coefficient (1 mm on 1 m2 = 1 L). The dry-spell length behind the
  tank recommendation is a sizing heuristic from annual rainfall, not a measurement.
* **Crops** - ranked by revenue per litre of water, adjusted for soil fit, available water, stressed aquifers, drought/flood
  tolerance and price risk. Prices, yields and costs are rounded national averages: confirm with your mandi and KVK.

### Limits you should know

* Groundwater data is **state-level** in the source survey, so two districts of one state share a stage value.
* No temperature data in the survey: heat is a forecast or an estimate, never a measurement.
* Vendor contacts in `backend/indra/data/vendors.json` were compiled earlier and **not independently verified**; the UI says
  so. Unknown cities get honest search links, never invented businesses.
* Two reference PDFs (IS 15797, CPWD manual) are scanned images and contribute no text without OCR.
* The in-process rate limiter is per replica; put a gateway limiter in front for hard guarantees.

---

## Security model

* **Authorization is policy, not code**: `policies.cedar` is default-deny - owners manage their tanks and subscriptions,
  leaders/admins publish alerts, only admins retrain models, suspended accounts are refused even if admin.
* **Auth modes**: `AUTH_MODE=firebase` verifies Firebase ID tokens (role from the `role` claim or `ADMIN_UIDS`);
  `AUTH_MODE=demo` trusts an `X-Demo-User` header for local development and **the app refuses to start with it when
  `INDRA_ENV=production`**.
* Sensors authenticate with a per-tank device key (stored only as a SHA-256 hash); service-to-service calls use a shared key
  that production refuses to leave at its default.
* No secrets in code; `.env` is git-ignored; containers run as non-root; Kubernetes uses default-deny NetworkPolicies.

> **Rotate credentials.** Earlier revisions of this project had an OpenRouter key, a Qdrant key and a Firebase service-account
> file in the working tree. They are no longer used by the code, but if they were ever pushed anywhere, revoke them.

## Testing

`python scripts/dev.py test` runs everything: climate engine (20), backend (80: API, Cedar, AI/RAG/LLM fallbacks, Strands agent
integration, Java integration), serverless evaluator (13, moto), Java telemetry (22), frontend typecheck + lint, and the
deployment validator. CI (`.github/workflows/ci.yml`) runs the same on Corretto 21 / Python 3.12 / Node 22. All tests run
offline.

## What changed in this cleanup

* One backend (`backend/`), one frontend (`frontend/`). Removed `indraBackend/`, `backend_v1_test/`, `iitD_Indra/`,
  `rain-harvest-3d/` (already absorbed by the frontend) and three identical copies of an 88 MB CSV - moved, not deleted, to
  `../IITD_INDRA_legacy_backup/` outside the repo. Six scattered READMEs became this one.
* **Found and fixed a data bug**: the "processed" CSV had z-score-normalised rainfall and groundwater columns (negative
  values) and filled missing rainfall with the global median, which is why a correction table existed. The engine now uses
  the raw values with explicit imputation and provenance.
* Replaced Qdrant + LangChain (five separate wirings) with one AI layer; replaced Supabase leftovers and Firestore-duplicating
  backend CRUD; removed fabricated "platform statistics" and news links; replaced mutating `GET` endpoints with proper verbs.
* Frontend: central API client, no hard-coded URLs, route/mode bugs fixed (no full-page reloads), error boundary, lazy 3D scene,
  vendor chunking, typed assessment results, mobile navigation, strict typecheck and lint.

## Known gaps / next steps

Run the containers, SAM and Firecracker paths on a machine that has the tools (see the honesty note); add OCR for scanned PDFs;
persist telemetry in DynamoDB/Timestream for multi-replica; per-user alert delivery needs a verified SES sender
(`SES_SENDER`) and, for SMS, an SNS-enabled account.


## Developed by

Soumya Sourav Das | Sudhanshu Shekhar | Palak Jain | Suravi Jha
