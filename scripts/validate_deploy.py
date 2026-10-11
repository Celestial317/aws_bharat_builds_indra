"""Static validation of every deployment artifact (no cluster or container engine needed).

Checks Kubernetes manifests for broken selectors / missing config references, the compose file for
dangling dependencies, Dockerfile COPY sources, the Firecracker config and the SAM template.

Usage: python scripts/validate_deploy.py      (exit code 1 on any problem)
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterator, List

import yaml

ROOT = Path(__file__).resolve().parents[1]
EXTERNAL_SECRETS = {"indra-secrets"}   # created out-of-band (see deploy/k8s/secret.example.yaml)


def load_all(path: Path) -> List[Dict[str, Any]]:
    return [d for d in yaml.safe_load_all(path.read_text(encoding="utf-8")) if d]


def k8s_docs(base: Path) -> List[Dict[str, Any]]:
    docs = []
    kustomization = load_all(base / "kustomization.yaml")[0]
    for name in kustomization["resources"]:
        docs.extend(load_all(base / name))
    return docs


def check_k8s(base: Path) -> Iterator[str]:
    docs = k8s_docs(base)
    by_kind: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for d in docs:
        for key in ("apiVersion", "kind"):
            if key not in d:
                yield f"{base.name}: document without {key}: {d.get('metadata')}"
        by_kind.setdefault(d["kind"], {})[d["metadata"]["name"]] = d

    workloads = {**by_kind.get("Deployment", {}), **by_kind.get("StatefulSet", {})}
    pod_labels = {}
    for name, w in workloads.items():
        tmpl_labels = w["spec"]["template"]["metadata"]["labels"]
        sel = w["spec"]["selector"]["matchLabels"]
        pod_labels[name] = tmpl_labels
        if not sel.items() <= tmpl_labels.items():
            yield f"{name}: selector {sel} does not match pod labels {tmpl_labels}"
        for c in w["spec"]["template"]["spec"]["containers"]:
            ports = {p["name"] for p in c.get("ports", []) if "name" in p}
            for probe in ("startupProbe", "readinessProbe", "livenessProbe"):
                target = c.get(probe, {}).get("httpGet", {}).get("port")
                if isinstance(target, str) and target not in ports:
                    yield f"{name}/{c['name']}: {probe} uses undeclared port name '{target}'"
            for ref in c.get("envFrom", []):
                cm, sec = ref.get("configMapRef"), ref.get("secretRef")
                if cm and cm["name"] not in by_kind.get("ConfigMap", {}):
                    yield f"{name}: envFrom configMap '{cm['name']}' not defined"
                if sec and sec["name"] not in EXTERNAL_SECRETS:
                    yield f"{name}: envFrom secret '{sec['name']}' is neither defined nor a known external secret"
            for env in c.get("env", []):
                sref = env.get("valueFrom", {}).get("secretKeyRef")
                if sref and sref["name"] not in EXTERNAL_SECRETS:
                    yield f"{name}: secretKeyRef '{sref['name']}' unknown"
            if not c.get("resources", {}).get("limits"):
                yield f"{name}/{c['name']}: no resource limits"
            if not (c.get("readinessProbe") or c.get("startupProbe")):
                yield f"{name}/{c['name']}: no readiness probe"

    for name, svc in by_kind.get("Service", {}).items():
        sel = svc["spec"]["selector"]
        if not any(sel.items() <= labels.items() for labels in pod_labels.values()):
            yield f"Service {name}: selector {sel} matches no workload"
        wanted = {p["targetPort"] for p in svc["spec"]["ports"] if isinstance(p["targetPort"], str)}
        have = {p["name"] for w in workloads.values() if sel.items() <= w["spec"]["template"]["metadata"]["labels"].items()
                for c in w["spec"]["template"]["spec"]["containers"] for p in c.get("ports", []) if "name" in p}
        for port in wanted - have:
            yield f"Service {name}: targetPort '{port}' not exposed by its pods"

    for name, ing in by_kind.get("Ingress", {}).items():
        for rule in ing["spec"]["rules"]:
            for path in rule["http"]["paths"]:
                backend = path["backend"]["service"]["name"]
                if backend not in by_kind.get("Service", {}):
                    yield f"Ingress {name}: backend service '{backend}' missing"

    for name, hpa in by_kind.get("HorizontalPodAutoscaler", {}).items():
        if hpa["spec"]["scaleTargetRef"]["name"] not in workloads:
            yield f"HPA {name}: target workload missing"

    for name, np in by_kind.get("NetworkPolicy", {}).items():
        sel = np["spec"]["podSelector"]
        if sel.get("matchLabels") and not any(sel["matchLabels"].items() <= l.items() for l in pod_labels.values()):
            yield f"NetworkPolicy {name}: podSelector matches no workload"

    namespaces = {d["metadata"].get("namespace") for d in docs if d["kind"] != "Namespace"}
    if namespaces != {"indra"}:
        yield f"all namespaced resources must live in 'indra', found {namespaces}"


def check_overlay(overlay: Path) -> Iterator[str]:
    kust = load_all(overlay / "kustomization.yaml")[0]
    for res in kust.get("resources", []):
        if not (overlay / res).exists():
            yield f"{overlay.name}: resource {res} missing"
    docs = {(d["kind"], d["metadata"]["name"]) for d in k8s_docs(overlay.parents[1] / "base")}
    for patch in kust.get("patches", []):
        target = patch["target"]
        if (target["kind"], target["name"]) not in docs:
            yield f"{overlay.name}: patch target {target} not found in base"


def check_compose() -> Iterator[str]:
    compose = yaml.safe_load((ROOT / "compose.yaml").read_text(encoding="utf-8"))
    services = compose["services"]
    for name, svc in services.items():
        for dep in (svc.get("depends_on") or {}):
            if dep not in services:
                yield f"compose: {name} depends on unknown service '{dep}'"
        build = svc.get("build")
        if build:
            ctx = ROOT / (build if isinstance(build, str) else build["context"])
            if not ctx.exists():
                yield f"compose: {name} build context {ctx} missing"
            if isinstance(build, dict) and not (ctx / build.get("dockerfile", "Dockerfile")).exists():
                yield f"compose: {name} dockerfile missing"
        for vol in svc.get("volumes", []):
            if isinstance(vol, str) and vol.startswith("./"):
                if not (ROOT / vol.split(":")[0]).exists():
                    yield f"compose: {name} bind mount {vol.split(':')[0]} missing"
        deps = svc.get("depends_on") or {}
        for dep, cond in (deps.items() if isinstance(deps, dict) else ((d, {}) for d in deps)):
            if isinstance(cond, dict) and cond.get("condition") == "service_healthy" and "healthcheck" not in services[dep] \
                    and "build" not in services[dep]:
                yield f"compose: {name} waits for {dep} to be healthy but {dep} has no healthcheck"


def check_dockerfiles() -> Iterator[str]:
    contexts = {"backend/Dockerfile": ROOT, "frontend/Dockerfile": ROOT, "services/telemetry/Dockerfile": ROOT / "services/telemetry"}
    for rel, ctx in contexts.items():
        for line in (ROOT / rel).read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*COPY\s+(?!--from)(.+?)\s+\S+\s*$", line)
            if m:
                for src in m.group(1).split():
                    if not src.startswith("-") and not list(ctx.glob(src)) and not (ctx / src).exists():
                        yield f"{rel}: COPY source '{src}' not found in context {ctx.relative_to(ROOT) or '.'}"
        text = (ROOT / rel).read_text(encoding="utf-8")
        if "USER " not in text:
            yield f"{rel}: runs as root (no USER)"
        if "HEALTHCHECK" not in text:
            yield f"{rel}: no HEALTHCHECK"
    nginx = (ROOT / "deploy/docker/nginx.conf").read_text(encoding="utf-8")
    if "proxy_pass http://backend:8000" not in nginx:
        yield "nginx.conf: /api proxy target changed unexpectedly"


def check_firecracker() -> Iterator[str]:
    cfg = json.loads((ROOT / "deploy/firecracker/vm-config.json").read_text())
    for key in ("boot-source", "drives", "machine-config", "network-interfaces"):
        if key not in cfg:
            yield f"firecracker: missing '{key}'"
    if sum(d.get("is_root_device", False) for d in cfg.get("drives", [])) != 1:
        yield "firecracker: exactly one root drive required"
    for script in ("build-rootfs.sh", "run.sh"):
        text = (ROOT / "deploy/firecracker" / script).read_text(encoding="utf-8")
        if not text.startswith("#!/usr/bin/env bash") or "set -euo pipefail" not in text:
            yield f"firecracker/{script}: missing shebang or strict mode"


def check_sam() -> Iterator[str]:
    exe = shutil.which("cfn-lint")
    if not exe:
        print("  (cfn-lint not installed - SAM template lint skipped)")
        return
    result = subprocess.run([exe, str(ROOT / "serverless/template.yaml")], capture_output=True, text=True)
    if result.returncode != 0:
        yield "cfn-lint: " + (result.stdout + result.stderr).strip()


def run_all() -> List[str]:
    problems: List[str] = []
    for label, gen in (("kubernetes base", check_k8s(ROOT / "deploy/k8s/base")),
                       ("kubernetes overlay", check_overlay(ROOT / "deploy/k8s/overlays/eks-anywhere")),
                       ("compose", check_compose()), ("dockerfiles", check_dockerfiles()),
                       ("firecracker", check_firecracker()), ("sam template", check_sam())):
        found = list(gen)
        print(f"{'FAIL' if found else 'ok  '} {label}")
        problems.extend(found)
    for path in (ROOT / "deploy").rglob("*.yaml"):
        try:
            load_all(path)
        except yaml.YAMLError as exc:
            problems.append(f"{path.relative_to(ROOT)}: invalid YAML: {exc}")
    return problems


if __name__ == "__main__":
    issues = run_all()
    for issue in issues:
        print("  -", issue)
    sys.exit(1 if issues else 0)
