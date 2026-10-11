"""One command for local development, on Windows, macOS and Linux.

    python scripts/dev.py setup     install dependencies, build the climate atlas and the Java service
    python scripts/dev.py up        run telemetry (Java) + API (uvicorn) + web app (Vite) together
    python scripts/dev.py test      run every test suite and static check
    python scripts/dev.py ingest    (re)build the RAG knowledge index from data/knowledge/*.pdf

Ctrl+C stops everything started by `up`.
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND, FRONTEND, TELEMETRY = ROOT / "backend", ROOT / "frontend", ROOT / "services" / "telemetry"
NPM = "npm.cmd" if os.name == "nt" else "npm"
PY = sys.executable


def run(cmd: list[str], cwd: Path = ROOT, check: bool = True, env: dict | None = None) -> int:
    print(f"\n$ {' '.join(cmd)}   [{cwd.relative_to(ROOT) or '.'}]", flush=True)
    result = subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})})
    if check and result.returncode:
        sys.exit(result.returncode)
    return result.returncode


def java_available() -> bool:
    return bool(shutil.which("javac") and shutil.which("java"))


def build_java() -> bool:
    if not java_available():
        print("  ! JDK not found: tank telemetry will be unavailable (install Amazon Corretto 21: https://aws.amazon.com/corretto/)")
        return False
    out = TELEMETRY / "out"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    sources = [str(p) for p in (TELEMETRY / "src" / "main").rglob("*.java")]
    run(["javac", "--release", "21", "-d", str(out), *sources], cwd=TELEMETRY)
    return True


def cmd_setup(_: argparse.Namespace) -> None:
    run([PY, "-m", "pip", "install", "-r", "requirements-dev.txt"], cwd=BACKEND)
    if not (ROOT / "packages/indra_climate/indra_climate/data/districts.json").exists():
        run([PY, "scripts/build_climate_data.py"])
    run([NPM, "ci", "--no-audit", "--no-fund"], cwd=FRONTEND)
    build_java()
    if not (ROOT / ".env").exists():
        shutil.copy(ROOT / ".env.example", ROOT / ".env")
        print("\nCreated .env from .env.example (add LLM_API_KEY to enable AI enrichment; everything works without it).")
    print("\nSetup complete. Start everything with:  python scripts/dev.py up")


def stream(name: str, proc: subprocess.Popen) -> None:
    assert proc.stdout
    for line in proc.stdout:
        print(f"[{name:9}] {line.rstrip()}", flush=True)


def cmd_up(_: argparse.Namespace) -> None:
    procs: list[tuple[str, subprocess.Popen]] = []

    def start(name: str, cmd: list[str], cwd: Path, env: dict | None = None) -> None:
        proc = subprocess.Popen(cmd, cwd=cwd, env={**os.environ, **(env or {})}, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        procs.append((name, proc))
        threading.Thread(target=stream, args=(name, proc), daemon=True).start()

    if java_available():
        if not (TELEMETRY / "out").exists():
            build_java()
        start("telemetry", ["java", "-cp", "out", "org.indra.telemetry.Main"], TELEMETRY,
              {"TELEMETRY_SERVICE_KEY": os.getenv("TELEMETRY_SERVICE_KEY", "dev-service-key"),
               "TELEMETRY_STORE": str(ROOT / "data" / "runtime" / "telemetry.json")})
    else:
        print("JDK not found - starting without tank telemetry.")
    start("api", [PY, "-m", "uvicorn", "indra.main:app", "--reload", "--port", "8000", "--reload-dir", "indra"], BACKEND)
    start("web", [NPM, "run", "dev", "--", "--host", "127.0.0.1"], FRONTEND)

    print("\nINDRA is starting:  web http://localhost:5173   api http://localhost:8000/docs   status http://localhost:8000/api/status\n")

    def stop(*_: object) -> None:
        for _name, p in procs:
            if p.poll() is None:
                p.terminate()
        time.sleep(1)
        for _name, p in procs:
            if p.poll() is None:
                p.kill()
        sys.exit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    while True:
        for name, p in procs:
            if p.poll() is not None:
                print(f"\n{name} exited with code {p.returncode}; stopping the rest.")
                stop()
        time.sleep(1)


def cmd_test(_: argparse.Namespace) -> None:
    failures = []

    def step(label: str, cmd: list[str], cwd: Path = ROOT) -> None:
        if run(cmd, cwd=cwd, check=False):
            failures.append(label)

    step("climate engine", [PY, "-m", "pytest", "-q"], ROOT / "packages" / "indra_climate")
    step("backend", [PY, "-m", "pytest", "-q"], BACKEND)
    step("serverless", [PY, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"], ROOT / "serverless")
    if java_available():
        out = TELEMETRY / "out"
        shutil.rmtree(out, ignore_errors=True)
        out.mkdir(parents=True)
        step("telemetry (build)", ["javac", "--release", "21", "-d", str(out), *map(str, (TELEMETRY / "src").rglob("*.java"))], TELEMETRY)
        step("telemetry (tests)", ["java", "-cp", "out", "org.indra.telemetry.TelemetryTests"], TELEMETRY)
    else:
        print("\n(JDK not installed - Java tests skipped)")
    step("frontend typecheck", [NPM, "run", "typecheck"], FRONTEND)
    step("frontend lint", [NPM, "run", "lint"], FRONTEND)
    step("deploy manifests", [PY, "scripts/validate_deploy.py"])
    print("\n" + ("ALL CHECKS PASSED" if not failures else "FAILED: " + ", ".join(failures)))
    sys.exit(1 if failures else 0)


def cmd_ingest(_: argparse.Namespace) -> None:
    run([PY, "scripts/ingest_knowledge.py"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, fn in (("setup", cmd_setup), ("up", cmd_up), ("test", cmd_test), ("ingest", cmd_ingest)):
        sub.add_parser(name).set_defaults(fn=fn)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
