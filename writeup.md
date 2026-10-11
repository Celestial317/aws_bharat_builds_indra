# INDRA - Project Write-up

## 1. Abstract

INDRA is a web platform that helps Indian households, housing societies, farmers and village councils survive the two
water extremes that hit the same places in the same year: **too much water in the monsoon, too little in summer, and
the heat in between.**

For any of 754 districts (about 19,000 pincodes) INDRA scores **flood, scarcity and heat risk**, shows a live 7-day
forecast with IMD-class alerts, and then turns that risk into action: a rooftop rainwater-harvesting plan (tank size,
system type, cost, feasibility), a village water budget, a low-water crop ranking, a live tank monitor that warns *"overflow
in 2 hours"* or *"empty in 14 hours"*, and an AI assistant grounded in real reference documents. Alerts reach subscribers by
email or SMS through a scheduled serverless pipeline.

The whole stack is built on **open-source AWS tools that run on a laptop - no AWS account, no card, no bill.**

## 2. Full form

**INDRA = Initiative for Drainage and Rainwater Acquisition.**

The name carries the theme: *drainage* (get monsoon water off the street safely) and *acquisition* (capture it for the
dry months). Users are called **Droplets**.

## 3. The two modes of INDRA

| | **INDRA (Standard / Urban)** | **INDRA-Gramin (Rural)** |
|---|---|---|
| Who | Households, apartments, housing societies | Farmers, cattle owners, gram panchayats |
| Core question | "How big a tank, what system, what does it cost, will my street flood?" | "How do I split limited water between family, cattle and fields, and what should I grow?" |
| Pages | Assessment, 3D Visualizer, Vendor Connect, Climate Risk | Droplet community, Water Management, Smart Cropping, Climate Risk |
| Assistant | Urban persona: costs, ROI, tanks, filtration, flood-proofing | Rural persona: simple words, replies in Hindi/Hinglish, crops, farm ponds, heatwaves |
| Theme colour | Blue `#0676c8` | Green `#32a854` |

A single toggle in the navbar switches the whole application (pages, navigation, colours, chatbot persona). The mode
follows the URL, so a shared `/gramin/...` link opens in Gramin mode.

### Why two modes?

Urban and rural India face the same weather but have **different problems, tools and literacy levels.**
A Mumbai apartment owner needs a quote, a tank drawing and a drainage plan. A farmer in Rajasthan needs to know how many
buckets of water the cattle get this week and whether to sow bajra instead of rice. One interface cannot serve both without
being cluttered for each, so INDRA keeps one engine and gives each audience its own front door.

### How it targets both rural and urban Bharat

* **Same climate engine, two lenses.** Both modes read the same district climate data; Standard turns it into infrastructure
  decisions, Gramin turns it into daily water and crop decisions.
* **Rural accessibility:** plain-language outputs, "buckets" (20 L) as the unit instead of litres, Hindi/Hinglish assistant,
  large high-contrast cards, mobile-friendly layout, and an offline-capable assistant that answers from the document library
  even when no AI model is reachable (useful on poor connectivity).
* **Urban depth:** cost breakdowns, feasibility scoring, structural constraints (a thatch or asbestos roof cannot carry a
  rooftop tank), recharge-pit logic for flood-prone plots, vendor directory and DIY installation guide.
* **Shared community layer:** Droplets post tips and questions, find nearby Droplets, and can share a tank's level with neighbours.

## 4. Theme: Bharat Builds - and we built it

The brief: *"Too much water, too little of it, and the heat in between. Build for the monsoon that floods the street and the
summer that dries the tap."* and *use the open-source AWS tools.*

What we built is a working, tested platform, not a mock-up: 754-district climate atlas, risk engine, API, web app, Java
telemetry service, serverless alert pipeline, Cedar authorization, RAG assistant, and deployment manifests for containers,
Kubernetes and microVMs. Every stage of the monsoon-to-summer cycle has a feature:

| Season | Problem | INDRA feature |
|---|---|---|
| Monsoon | Cloudburst, street flooding | Flood score + live IMD-class alerts, tank overflow warning, recharge-pit recommendation, "litres kept off the street" |
| Post-monsoon | Wasting surplus | Tank sizing, groundwater recharge advice |
| Pre-monsoon / summer | Dry taps, heatwaves | Scarcity and heat scores, hot-day demand (+up to 35%), "empty in N hours" tank alert, village water budget |
| All year | Knowing what to do | Assistant with tools, crop plan, vendor and DIY guide |

## 5. Technical features

* **Climate risk engine** (pure standard-library Python, shared by the API and the Lambda so scores never disagree):
  * *Flood score*: main-season rainfall (south-west **or** north-east monsoon, whichever is wetter, so Chennai is scored
    correctly), rain concentration, plus a live bump from the forecast using IMD classes (heavy >= 64.5, very heavy >= 115.6,
    extremely heavy >= 204.5 mm/24 h).
  * *Scarcity score*: low annual rainfall combined with CGWB groundwater-extraction stress.
  * *Heat score*: forecast peak temperature when online, otherwise a clearly labelled estimate.
  * *Swing index*: high only where **both** extremes bite - the "flood-and-famine" districts.
  * *Water balance*: harvest = roof area x rainfall x runoff coefficient (1 mm on 1 m2 = 1 L), tank sized for the estimated dry spell.
* **Data engineering:** rebuilt the climate dataset from the raw survey. The earlier "processed" file had z-score-normalised
  rainfall and groundwater columns and filled missing rainfall with the global median. The atlas now uses real values, infers
  unobserved districts from the three nearest observed ones, applies IMD overrides, and **labels the provenance** of every number.
* **Deterministic engines own the numbers; the LLM only adds narrative.** Cost, feasibility, tank dimensions, crop ranking,
  water budgets and risk scores are computed. If the AI model is down, every endpoint still returns a complete answer.
* **Strands agent** with three tools (climate risk, roof-sizing, cited document search), three-tier fallback (agent -> plain
  RAG -> offline grounded answer), retries with backoff and a circuit breaker so a dead provider never stalls the API.
* **RAG knowledge base:** 16 reference PDFs (CPWD manual, IS codes, handbooks, crop guides) -> 2,447 chunks -> MiniLM
  embeddings -> OpenSearch k-NN with an automatic local-index fallback.
* **Cedar policy engine:** default-deny rules for tanks, subscriptions, alert publishing and model training; suspended
  accounts are always refused.
* **Tank telemetry service** (Java 21, zero dependencies): per-tank device keys (stored only as SHA-256 hashes), regression-based
  trend over the last 3 hours, hours-to-empty / hours-to-full, atomic snapshots so tanks survive restarts.
* **Serverless alert pipeline:** a scheduled Lambda evaluates every subscribed district, de-duplicates alerts, stores them in
  DynamoDB, publishes to SNS and delivers per subscriber (email via SES, SMS via SNS).
* **Operations:** request IDs, structured logs, one error shape, rate limiting, `/health`, `/ready`, `/api/status`, non-root
  containers, health checks, HPA, PodDisruptionBudget and NetworkPolicies.
* **Quality:** 135 automated tests (climate 20, backend 80, serverless 13, Java 22), frontend typecheck and lint, a
  deployment-manifest validator and a CI workflow - all run offline.

## 6. Novelty and USP

* **Both extremes in one product.** Most tools handle either flood warnings or water scarcity. INDRA's *swing index* finds
  places that suffer both and designs one system for both (store for the dry months, route overflow to a recharge pit).
* **From risk to a rooftop.** The hazard score is not just a dashboard: it changes the recommended system type, tank size,
  recharge-pit advice and the Gramin water budget.
* **Honest AI.** Numbers come from engines with stated sources and confidence; the AI explains, it does not invent. It works
  with no model at all.
* **Runs anywhere, costs nothing.** Every cloud-style component (DynamoDB, SNS, Lambda, Kubernetes, vector search) has a free
  local equivalent, so a village NGO or a college can host it.
* **Policy-as-code security** with Cedar instead of scattered `if` statements.
* **Two Bharats, one engine.** One climate core serves apartment owners and farmers in their own language and units.

### Features at a glance

Climate risk and alerts - rooftop assessment - 3D visualizer of an RWH system - vendor directory and DIY guide - village
water budget - crop ranking - Droplet community and clustering - tank monitor - subscriptions by email/SMS - AI assistant
(urban and rural) - demo account for instant exploration.

## 7. How AWS (open-source) tooling is used

| AWS open-source tool | Used for | Where |
|---|---|---|
| **Strands Agents SDK** | The assistant's agent loop and tools | `backend/indra/ai/agents.py` |
| **PartyRock** | No-code prototype blueprints (monsoon-ready household, heatwave water budget). Hosted-only, so it cannot be embedded in code | `deploy/partyrock/` |
| **OpenSearch** | k-NN vector store for the document library (RAG) | `backend/indra/ai/knowledge.py` |
| **Cedar** | All authorization decisions | `backend/indra/policy/` |
| **Amazon Corretto** | JDK for the Java tank-telemetry service | `services/telemetry/` |
| **AWS SAM CLI** | Defines and builds the scheduled alert Lambda, DynamoDB tables and SNS topic | `serverless/template.yaml` |
| **LocalStack** | Local DynamoDB / SNS / SES / Lambda so the pipeline runs with no AWS account | `compose.yaml`, `scripts/localstack_bootstrap.py` |
| **Finch** | Build and run the container images and compose stack | `compose.yaml`, Dockerfiles, `Makefile` |
| **EKS Distro / EKS Anywhere** | Kubernetes deployment (kustomize base + overlay, cluster spec) | `deploy/k8s/`, `deploy/eks-anywhere/`, `deploy/eks-distro/` |
| **Firecracker** | Boot the telemetry service in a microVM to isolate untrusted sensor traffic | `deploy/firecracker/` |

**Verification status (honest):** the agent, Cedar policies, alert Lambda (against an in-process AWS emulator), Java service
and OpenSearch fallback logic are tested. The container images, Kubernetes apply, `sam build/local`, LocalStack container and
Firecracker boot are validated statically but were **not executed** on the development machine (no container engine, `sam` or KVM).

## 8. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript (strict), Vite, Tailwind CSS, React Router, Recharts, Three.js / React Three Fiber (3D), Framer Motion |
| Backend | Python 3.12, FastAPI, Pydantic v2, httpx, scikit-learn |
| AI / search | Strands Agents SDK, any OpenAI-compatible LLM (OpenRouter or local Ollama), sentence-transformers (MiniLM), OpenSearch k-NN |
| Security | Cedar (`cedarpy`), Firebase Authentication, per-device keys, rate limiting |
| Data | Firebase Firestore (community), DynamoDB (alerts), versioned climate atlas (JSON) built from CGWB / IMD-based survey data |
| Telemetry | Java 21 on Amazon Corretto, JDK `HttpServer`, virtual threads |
| Serverless | AWS SAM, Lambda (Python 3.12), EventBridge schedule, DynamoDB, SNS, SES |
| Weather | Open-Meteo forecast API (free, no key) |
| Delivery | Finch / Docker, Kubernetes (EKS Distro / Anywhere), Firecracker, GitHub Actions |

## 9. Impact, feasibility and benefits

### Impact

* **Safety:** a flood or heatwave alert with a concrete action ("clear the first-flush chamber, open the overflow to the
  recharge pit") reaches subscribers before the event, and the tank monitor gives hours of lead time.
* **Water security:** a rooftop system turns monsoon runoff into stored water. Example from the engine's own formula: a 100 m2
  RCC roof in a 1,000 mm district harvests about 80,000 L a year (area x rainfall x 0.8) - roughly 148 days of water for a
  four-person household at 135 L per person per day, and every litre stored is a litre kept off the street.
* **Groundwater:** recharge-pit recommendations target districts where extraction already exceeds recharge.
* **Farm economics:** ranking crops by rupees earned per litre steers farmers in stressed aquifers away from thirsty crops
  while accounting for price risk.

### Feasibility

* **Already working:** the platform runs end to end locally; the first-time setup is two commands (`python scripts/dev.py setup`, `up`).
* **Low cost:** free open-source stack; runs on a single small server or a laptop; no mandatory paid service. AI enrichment is optional.
* **Resilient to poor conditions:** deterministic engines and an offline assistant keep working without internet-dependent AI.
* **Path to scale:** stateless API with HPA, vector search on OpenSearch, serverless alerts, and a Kubernetes overlay for EKS Anywhere.
* **Known limits (stated in the app):** groundwater data is state-level in the source survey; heat is a forecast or a labelled
  estimate; crop prices are indicative national averages; the dry-spell length is a sizing heuristic; vendor contacts are
  unverified starter data.

### Benefits by stakeholder

| Stakeholder | Benefit |
|---|---|
| Households / societies | Right-sized system, lower tanker dependence, less street flooding, clear cost and payback |
| Farmers | Daily water budget, crop choice per litre, heatwave guidance in their language |
| Panchayats / NGOs | Shared tank visibility, community alerts from leaders, district hotspot ranking |
| Government / planners | District-level swing index showing where flood and scarcity coincide |
| Developers | Open, documented, tested stack deployable without cloud spend |

## 10. Design and usability

* **One consistent brand:** blue for Standard, green for Gramin, rounded cards, clear iconography.
* **Plain-language risk:** each hazard shows a 0-100 gauge, a Low/Moderate/High/Severe chip, and the reasons behind it.
  Seasons are framed in human terms ("Pre-monsoon heat - the tap runs dry").
* **Action-first alerts:** every alert carries a "What to do" line; severity is colour- and icon-coded.
* **Progressive disclosure:** headline numbers first, formulas and assumptions below, data-source badges where it matters
  (live forecast vs estimate, imputed rainfall).
* **Accessibility and reach:** mobile navigation strip, large touch targets, Hindi/Hinglish assistant, buckets instead of litres
  for farmers, ARIA labels on charts and dialogs.
* **Resilient UX:** error boundary so one broken page never blanks the app, clear messages for network or server errors,
  debounced inputs, cancelled stale requests, lazy-loaded 3D scene for fast first load.
* **Low-friction onboarding:** a one-click demo account and demo-values button, and profile/assessments that keep working
  on-device even if the cloud database refuses access.
* **Immersive learning:** an interactive 3D visualizer explains each part of an RWH system (catchment, gutters, first flush, filter, tank).

## 11. Future scope and how it solves the problem

| Next step | Problem it solves |
|---|---|
| **Real sensors at scale** (low-cost ultrasonic level + rain gauge on LoRa/GSM) feeding the telemetry service, persisted in DynamoDB/Timestream | Moves from estimated to measured water, gives neighbourhood-level flood and shortage maps |
| **Hyper-local forecasts** (nowcasting, IMD district warnings, ward-level flood models) | Earlier, more precise cloudburst and heatwave alerts |
| **Real temperature and groundwater-level data** (CGWB district wells) | Replaces the heat estimate and state-level groundwater with measured, district-level values |
| **WhatsApp / IVR / regional-language voice** and more Indian languages | Reaches farmers without smartphones or literacy barriers |
| **Verified vendor and subsidy network**, scheme eligibility checks (Jal Shakti Abhiyan, Atal Bhujal, state subsidies) | Turns a plan into an installed, funded system |
| **Community-scale planning** (check dams, farm ponds, percolation tanks) with cluster-level recommendations | Solves the problem at village and watershed level, not just per roof |
| **OCR for scanned reference PDFs** and a larger curated knowledge base | Richer, cited advice |
| **Production hardening:** multi-replica telemetry store, managed OpenSearch with TLS, SES/SNS in a real account, Firecracker-isolated ingest | Ready for city or state deployment |
| **Impact tracking:** litres stored, floods avoided, groundwater recharged per district | Evidence for governments and funders |

**How it solves the problem:** floods and shortages are two faces of the same missing capability - *capturing water when
there is too much and rationing it when there is too little*. INDRA gives every household and village (1) early, local
warning, (2) a right-sized system to capture and recharge monsoon water, (3) a plan to use stored water wisely through
summer heat, and (4) a community layer to share information - using tools that cost nothing to run, so the benefit is not
limited to those who can afford it.
