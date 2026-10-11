"""Integration: FastAPI + Cedar + the real Java telemetry service (compiled and started on a free port).
Skipped automatically when no JDK is installed."""

import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from .conftest import as_user

SERVICE_DIR = Path(__file__).resolve().parents[2] / "services" / "telemetry"
pytestmark = pytest.mark.skipif(not (shutil.which("javac") and shutil.which("java")), reason="JDK not installed")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def telemetry(tmp_path_factory):
    out = tmp_path_factory.mktemp("telemetry-classes")
    sources = [str(p) for p in (SERVICE_DIR / "src" / "main").rglob("*.java")]
    subprocess.run(["javac", "--release", "21", "-d", str(out), *sources], check=True)
    port = free_port()
    env = {**os.environ, "PORT": str(port), "TELEMETRY_SERVICE_KEY": "test-key", "TELEMETRY_STORE": ""}
    proc = subprocess.Popen(["java", "-cp", str(out), "org.indra.telemetry.Main"], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            urllib.request.urlopen(f"{url}/healthz", timeout=0.5)
            break
        except OSError:
            time.sleep(0.2)
    else:
        proc.kill()
        pytest.fail("telemetry service did not start")
    yield url
    proc.kill()


@pytest.fixture()
def api(telemetry, monkeypatch):
    from indra.config import get_settings
    from indra.main import create_app

    monkeypatch.setenv("TELEMETRY_URL", telemetry)
    monkeypatch.setenv("TELEMETRY_SERVICE_KEY", "test-key")
    get_settings.cache_clear()
    with TestClient(create_app()) as c:
        yield c
    get_settings.cache_clear()


def send_reading(telemetry, tank_id, key, level):
    req = urllib.request.Request(f"{telemetry}/v1/tanks/{tank_id}/readings", method="POST",
                                 data=f'{{"levelLiters": {level}}}'.encode(),
                                 headers={"X-Device-Key": key, "Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=3).status


def test_tank_lifecycle_with_cedar(api, telemetry):
    created = api.post("/api/tanks", json={"name": "Terrace", "capacity_liters": 1000}, headers=as_user("asha"))
    assert created.status_code == 201
    tank = created.json()
    assert tank["deviceKey"] and "deviceKey" not in api.get("/api/tanks", headers=as_user("asha")).json()["tanks"][0]

    assert send_reading(telemetry, tank["id"], tank["deviceKey"], 950) == 202
    detail = api.get(f"/api/tanks/{tank['id']}", headers=as_user("asha")).json()
    assert detail["state"] == "overflow_risk" and detail["fillPct"] == 95.0

    # private tank: strangers are refused by Cedar, admins are not
    assert api.get(f"/api/tanks/{tank['id']}", headers=as_user("ravi")).status_code == 403
    assert api.get(f"/api/tanks/{tank['id']}", headers=as_user("root-admin")).status_code == 200
    assert api.delete(f"/api/tanks/{tank['id']}", headers=as_user("ravi")).status_code == 403
    assert api.delete(f"/api/tanks/{tank['id']}", headers=as_user("asha")).status_code == 204
    assert api.get(f"/api/tanks/{tank['id']}", headers=as_user("asha")).status_code == 404


def test_shared_tank_readable_not_writable(api):
    t = api.post("/api/tanks", json={"name": "Village tank", "capacity_liters": 5000, "shared": True},
                 headers=as_user("lena")).json()
    assert api.get(f"/api/tanks/{t['id']}", headers=as_user("ravi")).status_code == 200
    assert api.delete(f"/api/tanks/{t['id']}", headers=as_user("ravi")).status_code == 403
    assert t["id"] in [x["id"] for x in api.get("/api/tanks/shared", headers=as_user("ravi")).json()["tanks"]]
    assert t["id"] not in [x["id"] for x in api.get("/api/tanks", headers=as_user("ravi")).json()["tanks"]]


def test_requires_sign_in(api):
    assert api.get("/api/tanks").status_code == 401
    assert api.post("/api/tanks", json={"name": "x", "capacity_liters": 1}).status_code == 401


def test_unreachable_telemetry_is_a_clean_503(monkeypatch):
    from indra.config import get_settings
    from indra.main import create_app

    monkeypatch.setenv("TELEMETRY_URL", f"http://127.0.0.1:{free_port()}")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            r = c.get("/api/tanks", headers=as_user("asha"))
        assert r.status_code == 503 and "telemetry" in r.json()["error"]["message"].lower()
    finally:
        get_settings.cache_clear()
