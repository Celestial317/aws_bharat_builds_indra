import pytest

from .conftest import as_user

ASSESSMENT = {
    "name": "Asha", "state": "Tamil Nadu", "district": "Chennai", "pincode": "600001", "n_members": 4,
    "catchment_area": 120, "farm_land_area": 0, "roof_type": "Flat", "roof_material": "RCC", "budget": 40000,
}


def test_health_and_ready(client):
    assert client.get("/health").json()["status"] == "healthy"
    ready = client.get("/ready").json()
    assert ready["status"] == "ready" and ready["districts"] > 700


def test_status_reports_components(client):
    body = client.get("/api/status").json()
    assert body["config"]["auth_mode"] == "demo"
    assert "climate_atlas" in body["components"] and "ai" in body["components"]
    assert "llm_api_key" not in str(body).lower()


def test_error_shape_and_request_id(client):
    r = client.get("/api/climate/risk")  # missing location
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "bad_request" and err["request_id"]
    assert r.headers["x-request-id"]


def test_validation_errors_list_fields(client):
    r = client.post("/api/assessment/analyze", json={**ASSESSMENT, "pincode": "12"})
    assert r.status_code == 422
    assert any("pincode" in d["field"] for d in r.json()["error"]["details"])


def test_cors_only_for_configured_origin(client):
    ok = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    bad = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


# ----------------------------------------------------------------------------- climate
def test_climate_risk_by_pincode(client):
    body = client.get("/api/climate/risk", params={"pincode": "600001", "live": "false"}).json()
    assert body["location"]["district"] == "Chennai"
    assert set(body["scores"]) == {"flood", "drought", "heat"}
    assert body["basis"]["forecast"] == "none"


def test_climate_risk_with_water_balance(client):
    body = client.get("/api/climate/risk", params={
        "district": "Pune", "live": "false", "roof_area_sqm": 100, "members": 4}).json()
    assert body["water_balance"]["annual_harvest_l"] > 0


def test_climate_unknown_location(client):
    assert client.get("/api/climate/risk", params={"district": "Atlantis"}).status_code == 404


def test_hotspots_sorted_and_filterable(client):
    rows = client.get("/api/climate/hotspots", params={"hazard": "flood", "limit": 5}).json()["districts"]
    assert len(rows) == 5 and rows == sorted(rows, key=lambda r: -r["flood"])
    raj = client.get("/api/climate/hotspots", params={"hazard": "drought", "state": "Rajasthan"}).json()["districts"]
    assert raj and all(r["state"] == "Rajasthan" for r in raj)


def test_districts_list(client):
    assert "Chennai" in client.get("/api/climate/districts", params={"state": "Tamil Nadu"}).json()["districts"]
    assert client.get("/api/climate/districts", params={"state": "Nowhere"}).status_code == 404


# ----------------------------------------------------------------------------- assessment
def test_assessment_works_without_llm(client):
    r = client.post("/api/assessment/analyze", json=ASSESSMENT)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ai_enhanced"] is False
    assert 0 <= body["feasibility"]["overall_score"] <= 100
    rwh = body["rwh_analysis"]
    assert rwh["annual_harvestable_water_liters"] > 0
    tank = rwh["tank_dimensions"]
    assert 0.95 <= tank["height_meters"] <= 3.0 and 0.9 <= tank["diameter_meters"] <= 2.0
    assert body["climate"]["scores"]["flood"]["level"]
    assert body["implementation"]["phases"] and body["recommendations"]


def test_assessment_asbestos_roof_gets_pit_recharge(client):
    body = client.post("/api/assessment/analyze", json={**ASSESSMENT, "roof_material": "Asbestos"}).json()
    assert body["rwh_analysis"]["rwh_type_code"] == "pit_recharge"


def test_assessment_unknown_pincode_falls_back_to_district(client):
    r = client.post("/api/assessment/analyze", json={**ASSESSMENT, "pincode": "999999"})
    assert r.status_code == 200


# ----------------------------------------------------------------------------- gramin
def test_water_management_budget(client):
    r = client.post("/api/gramin/water-management/predict", json={
        "pincode": "302001", "season": "summer", "cattle_count": 5, "household_members": 5, "farm_size_acres": 3})
    assert r.status_code == 200, r.text
    d = r.json()["distribution"]
    assert d["drinking_buckets"] > 0
    assert d["irrigation_pct"] + d["cattle_pct"] + d["drinking_pct"] == pytest.approx(100, abs=0.5)
    assert r.json()["water_status"]


def test_water_management_validation(client):
    assert client.post("/api/gramin/water-management/predict", json={"season": "monsoon"}).status_code == 400
    assert client.post("/api/gramin/water-management/predict",
                       json={"pincode": "302001", "season": "spring"}).status_code == 422


def test_water_tips_unavailable_offline_is_clean_error_or_list(client):
    r = client.get("/api/gramin/water-management/tips", params={"season": "summer"})
    assert r.status_code in (200, 503)


def test_crops_rank_by_water_efficiency(client):
    body = client.post("/api/gramin/crop-suggestions", json={
        "location": "Jaisalmer, Rajasthan", "soil_type": "Sandy", "season": "Kharif",
        "water_availability": "Low", "farm_size_acres": 2}).json()
    names = [r["crop_name"] for r in body["recommendations"]]
    assert 1 <= len(names) <= 5
    assert "Rice (Paddy)" not in names and "Sugarcane" not in names   # thirsty crops excluded in a desert
    assert [r["rank"] for r in body["recommendations"]] == list(range(1, len(names) + 1))
    assert body["data_note"]


def test_crops_respect_season(client):
    def names(season):
        body = client.post("/api/gramin/crop-suggestions", json={
            "location": "Indore, Madhya Pradesh", "soil_type": "Black", "season": season,
            "water_availability": "Medium", "farm_size_acres": 5}).json()
        return [r["crop_name"] for r in body["recommendations"]]

    from indra.data.crops import CROPS

    seasons = {c.name: c.seasons for c in CROPS}
    for season in ("Kharif", "Rabi", "Zaid"):
        assert all(season in seasons[n] for n in names(season))
    assert "Wheat" not in names("Kharif")


def test_crops_overexploited_aquifer_steers_away_from_thirsty_crops(client):
    body = client.post("/api/gramin/crop-suggestions", json={
        "location": "Ludhiana, Punjab", "soil_type": "Loamy", "season": "Kharif",
        "water_availability": "High", "farm_size_acres": 5}).json()
    assert "Rice (Paddy)" not in [r["crop_name"] for r in body["recommendations"][:2]]


def test_crops_bad_input(client):
    r = client.post("/api/gramin/crop-suggestions", json={
        "location": "Pune", "soil_type": "Loamy", "season": "Winter", "water_availability": "Low", "farm_size_acres": 1})
    assert r.status_code == 422


# ----------------------------------------------------------------------------- chat + vendors
@pytest.mark.parametrize("persona", ["standard", "rural"])
def test_chat_degrades_to_offline_answer(client, persona):
    r = client.post(f"/api/chatbot/{persona}", json={"message": "How much rain does Pune get and how big a tank?"})
    assert r.status_code == 200
    assert r.json()["mode"] in {"offline", "rag", "agent"} and r.json()["response"]


def test_chat_rejects_empty_and_huge(client):
    assert client.post("/api/chatbot/standard", json={"message": ""}).status_code == 422
    assert client.post("/api/chatbot/standard", json={"message": "x" * 5000}).status_code == 422


def test_vendors_curated_city(client):
    body = client.get("/api/vendors/search", params={"location": "Pune"}).json()
    assert body["success"] and body["results"]["stores"]
    assert all(v["source"] in {"curated", "web", "search_link"} for v in body["results"]["stores"])


def test_vendors_unknown_city_gets_search_links_not_fake_businesses(client):
    body = client.get("/api/vendors/search", params={"location": "Nowhereville"}).json()
    assert all(v["source"] == "search_link" for v in body["results"]["stores"])


def test_diy_guide(client):
    assert len(client.get("/api/vendors/diy-guide").json()["guide"]["steps"]) >= 8


# ----------------------------------------------------------------------------- alerts + Cedar
def test_feed_is_public_and_lists_live_alerts(client):
    body = client.get("/api/alerts/feed", params={"district": "Jaisalmer"}).json()
    assert body["district"] == "Jaisalmer" and isinstance(body["live"], list)


def test_subscriptions_require_sign_in(client):
    r = client.post("/api/alerts/subscriptions", json={"district": "Pune", "contact": "a@b.co"})
    assert r.status_code == 401


def test_subscription_lifecycle_and_isolation(client):
    body = {"district": "Pune", "contact": "asha@example.org"}
    created = client.post("/api/alerts/subscriptions", json=body, headers=as_user("asha"))
    assert created.status_code == 201
    sub_id = created.json()["subId"]
    assert [s["subId"] for s in client.get("/api/alerts/subscriptions", headers=as_user("asha")).json()["subscriptions"]] == [sub_id]
    assert client.get("/api/alerts/subscriptions", headers=as_user("ravi")).json()["subscriptions"] == []
    assert client.delete(f"/api/alerts/subscriptions/{sub_id}", headers=as_user("ravi")).status_code == 404
    assert client.delete(f"/api/alerts/subscriptions/{sub_id}", headers=as_user("asha")).status_code == 204


def test_publish_alert_is_leader_or_admin_only(client):
    payload = {"district": "Pune", "type": "flood", "level": "warning", "title": "Mula river rising"}
    assert client.post("/api/alerts/publish", json=payload, headers=as_user("asha")).status_code == 403
    ok = client.post("/api/alerts/publish", json=payload, headers=as_user("root-admin"))
    assert ok.status_code == 201
    feed = client.get("/api/alerts/feed", params={"district": "Pune"}).json()
    assert any(a["title"] == "Mula river rising" for a in feed["stored"])


def test_cluster_training_is_admin_only(client):
    droplets = [{"uid": f"u{i}", "state": "Kerala", "district": "Kochi", "n_members": 3 + i % 3,
                 "catchment_area": 80 + i * 10, "latitude": 9.9 + i / 100, "longitude": 76.2} for i in range(8)]
    assert client.post("/api/community/clusters/train", json={"droplets": droplets}, headers=as_user("asha")).status_code == 403
    assert client.post("/api/community/clusters/train", json={"droplets": droplets[:2]},
                       headers=as_user("root-admin")).status_code == 422


def test_rate_limit_returns_429(monkeypatch):
    from fastapi.testclient import TestClient

    from indra.config import get_settings
    from indra.main import create_app

    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "3")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            codes = [c.get("/api/climate/states").status_code for _ in range(5)]
            limited = c.get("/api/climate/states")
        assert codes[:3] == [200, 200, 200] and 429 in codes
        assert limited.headers["retry-after"] and limited.json()["error"]["code"] == "rate_limited"
    finally:
        monkeypatch.delenv("RATE_LIMIT_PER_MINUTE")
        monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "0")
        get_settings.cache_clear()
