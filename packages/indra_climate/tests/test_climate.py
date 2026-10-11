import datetime as dt

import pytest

from indra_climate import Forecast, assess_risk, evaluate_alerts, get_atlas, water_balance
from indra_climate.engine import IMD_EXTREME, IMD_HEAVY, IMD_VERY_HEAVY, interp, level_for


@pytest.fixture(scope="module")
def atlas():
    return get_atlas().load()


def forecast(precip, tmax):
    days = [f"2026-07-{i + 1:02d}" for i in range(len(precip))]
    return Forecast.from_daily(0, 0, {"time": days, "precipitation_sum": precip, "temperature_2m_max": tmax})


def test_interp_clamps_and_interpolates():
    pts = [(0, 0), (10, 100)]
    assert interp(-5, pts) == 0
    assert interp(5, pts) == 50
    assert interp(50, pts) == 100


def test_level_boundaries():
    assert [level_for(s) for s in (0, 24.9, 25, 49.9, 50, 74.9, 75, 100)] == [
        "low", "low", "moderate", "moderate", "high", "high", "severe", "severe"]


def test_atlas_covers_india(atlas):
    assert len(atlas) > 700
    assert len(atlas.states()) >= 35


def test_atlas_lookup_priority(atlas):
    exact = atlas.find(pincode="600001")
    assert exact["district"] == "Chennai" and exact["match_type"] == "exact_pincode"
    nearby = atlas.find(pincode="600999")
    assert nearby["match_type"] in {"nearest_pincode", "regional_pincode"}
    assert atlas.find(district="jaisalmer")["state"] == "Rajasthan"
    assert atlas.find(state="Kerala")["match_type"] == "state"
    assert atlas.find(pincode="abc", district="nowhere", state="nowhere") is None


def test_rainfall_is_real_not_standardised(atlas):
    """Regression: the old processed CSV z-scored these columns (negative values)."""
    for d in atlas.districts():
        assert d["rainfall"]["annual"] > 0
        stage = d["groundwater"]["stage_pct"]
        assert stage is None or stage >= 0


def test_chennai_flood_uses_north_east_monsoon(atlas):
    chennai = atlas.find(district="Chennai")
    report = assess_risk(chennai, today=dt.date(2026, 11, 10))
    assert report.season["monsoon_name"] == "north-east monsoon"
    assert report.season["focus"] == "flood"
    assert report.scores["flood"]["score"] >= 35


def test_arid_vs_wet_districts_rank_sensibly(atlas):
    arid = assess_risk(atlas.find(district="Jaisalmer"))
    wet = assess_risk(atlas.find(district="East Khasi Hills"))
    assert arid.scores["drought"]["score"] > wet.scores["drought"]["score"]
    assert wet.scores["flood"]["score"] > arid.scores["flood"]["score"]
    assert arid.scores["heat"]["score"] > wet.scores["heat"]["score"]


def test_forecast_raises_flood_score(atlas):
    record = atlas.find(district="Pune")
    calm = assess_risk(record, forecast([0] * 7, [32] * 7)).scores["flood"]["score"]
    storm = assess_risk(record, forecast([5, 130, 40, 0, 0, 0, 0], [30] * 7)).scores["flood"]["score"]
    assert storm > calm + 20


@pytest.mark.parametrize("peak,level", [(IMD_HEAVY, "watch"), (IMD_VERY_HEAVY, "warning"), (IMD_EXTREME, "critical")])
def test_imd_rain_thresholds(atlas, peak, level):
    alerts = evaluate_alerts(atlas.find(district="Pune"), forecast([peak, 0, 0, 0, 0, 0, 0], [30] * 7))
    flood = [a for a in alerts if a.type == "flood"]
    assert flood and flood[0].level == level and flood[0].action


@pytest.mark.parametrize("tmax,level", [(40, "watch"), (43, "warning"), (45, "critical")])
def test_heat_thresholds(atlas, tmax, level):
    alerts = evaluate_alerts(atlas.find(district="Jaipur"), forecast([0] * 7, [tmax] + [30] * 6))
    heat = [a for a in alerts if a.type == "heat"]
    assert heat and heat[0].level == level


def test_alerts_sorted_by_severity(atlas):
    alerts = evaluate_alerts(atlas.find(district="Jaipur"), forecast([130] + [0] * 6, [45] + [30] * 6))
    order = {"info": 0, "watch": 1, "warning": 2, "critical": 3}
    severities = [order[a.level] for a in alerts]
    assert severities == sorted(severities, reverse=True)


def test_no_alerts_in_benign_conditions(atlas):
    assert [a for a in evaluate_alerts(atlas.find(district="Kozhikode"), forecast([2] * 7, [31] * 7))
            if a.type in {"flood", "heat"}] == []


def test_water_balance_arithmetic(atlas):
    record = {"rainfall": {"annual": 1000, "monsoon": 800, "post_monsoon": 100, "summer": 80, "winter": 20},
              "groundwater": {"stage_pct": 50}}
    wb = water_balance(record, roof_area_sqm=100, members=4, runoff_coeff=0.8)
    assert wb["annual_harvest_l"] == 80_000          # 100 m2 x 1000 mm x 0.8
    assert wb["monsoon_harvest_l"] == 64_000
    assert wb["household_daily_demand_l"] == 540
    assert wb["self_sufficiency_days"] == pytest.approx(148.1, abs=0.1)
    assert wb["recommended_tank_l"] % 500 == 0
    assert wb["recommended_tank_l"] <= 0.6 * wb["monsoon_harvest_l"]


def test_hot_day_demand_rises_with_heat():
    record = {"rainfall": {"annual": 600, "monsoon": 400, "post_monsoon": 50, "summer": 100, "winter": 50}, "groundwater": {}}
    cool = water_balance(record, 50, 4, heat={"score": 0})
    hot = water_balance(record, 50, 4, heat={"score": 100})
    assert hot["hot_day_demand_l"] > cool["hot_day_demand_l"] == cool["household_daily_demand_l"]


def test_water_balance_handles_degenerate_input():
    wb = water_balance({"rainfall": {"annual": 800, "monsoon": 600}, "groundwater": {}}, roof_area_sqm=0, members=0)
    assert wb["annual_harvest_l"] == 0 and wb["recommended_tank_l"] == 0


def test_missing_groundwater_does_not_crash(atlas):
    nicobar = atlas.find(district="Nicobars")
    report = assess_risk(nicobar)
    assert 0 <= report.scores["drought"]["score"] <= 100
