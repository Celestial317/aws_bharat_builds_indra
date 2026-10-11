"""Simulate a smart tank sensor through a monsoon cloudburst and a summer dry spell.

Registers a tank in the telemetry service (or reuses --tank-id/--device-key), then streams readings so
the dashboard shows both failure modes: overflow risk when it pours, "tap runs dry" when it doesn't.

Usage:
    python scripts/simulate_tank.py --scenario monsoon      # fills up fast -> overflow_risk
    python scripts/simulate_tank.py --scenario summer       # drains -> low
    python scripts/simulate_tank.py --scenario both --speed 60
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone


def call(method: str, url: str, headers: dict, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


def level_series(scenario: str, capacity: float, minutes: int):
    """Yield (minute, level_litres, rain_mm_per_10min)."""
    level = capacity * (0.35 if scenario == "monsoon" else 0.55)
    for m in range(0, minutes, 10):
        if scenario == "monsoon":                       # cloudburst between 25% and 70% of the run
            phase = m / minutes
            intensity = 0.0 if phase < 0.25 or phase > 0.7 else math.sin((phase - 0.25) / 0.45 * math.pi)
            rain = 12.0 * intensity
            level += rain * 11.0 + random.uniform(-2, 2) - 1.0
        else:                                           # hot dry spell: household draw-down, no rain
            rain = 0.0
            level -= 5.0 + 3.5 * math.sin(m / 90.0) ** 2 + random.uniform(-1, 1)
        level = min(max(level, 0.0), capacity)
        yield m, level, rain


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", default=os.getenv("TELEMETRY_URL", "http://127.0.0.1:8090"))
    p.add_argument("--service-key", default=os.getenv("TELEMETRY_SERVICE_KEY", "dev-service-key"))
    p.add_argument("--owner", default=os.getenv("DEMO_USER", "demo"))
    p.add_argument("--scenario", choices=["monsoon", "summer", "both"], default="both")
    p.add_argument("--capacity", type=float, default=2000.0)
    p.add_argument("--hours", type=int, default=8, help="simulated hours per scenario")
    p.add_argument("--speed", type=float, default=0.0, help="simulated minutes per real second (0 = instant backfill)")
    p.add_argument("--tank-id")
    p.add_argument("--device-key")
    p.add_argument("--shared", action="store_true")
    args = p.parse_args()

    svc = {"X-Service-Key": args.service_key}
    if not args.tank_id:
        status, body = call("POST", f"{args.url}/v1/tanks", svc, {
            "name": f"Demo tank ({args.scenario})", "ownerId": args.owner, "capacityLiters": args.capacity, "shared": args.shared})
        if status != 201:
            print(f"could not register tank: {status} {body}")
            return 1
        args.tank_id, args.device_key = body["id"], body["deviceKey"]
        print(f"registered {args.tank_id} for owner '{args.owner}'")
    if not args.device_key:
        print("--device-key is required with --tank-id")
        return 1

    scenarios = ["monsoon", "summer"] if args.scenario == "both" else [args.scenario]
    minutes = args.hours * 60
    start = datetime.now(timezone.utc) - timedelta(minutes=minutes * len(scenarios))
    clock = start
    for scenario in scenarios:
        print(f"-- {scenario}")
        for m, level, rain in level_series(scenario, args.capacity, minutes):
            ts = clock + timedelta(minutes=m)
            status, body = call("POST", f"{args.url}/v1/tanks/{args.tank_id}/readings", {"X-Device-Key": args.device_key},
                                {"levelLiters": round(level, 1), "rainMm": round(rain, 1), "ts": ts.isoformat().replace("+00:00", "Z")})
            if status != 202:
                print(f"reading rejected: {status} {body}")
                return 1
            if args.speed:
                time.sleep(10 / args.speed)
        clock += timedelta(minutes=minutes)
        status, body = call("GET", f"{args.url}/v1/tanks/{args.tank_id}", svc)
        print(f"   state={body['state']} fill={body.get('fillPct')}% to-empty={body.get('hoursToEmpty')}h to-full={body.get('hoursToFull')}h")
    print(f"done. Open the dashboard as user '{args.owner}' (demo mode) to watch tank {args.tank_id}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
