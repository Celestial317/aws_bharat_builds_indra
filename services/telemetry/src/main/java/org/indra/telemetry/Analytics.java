package org.indra.telemetry;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Turns raw level readings into the two numbers a household cares about in a flood-or-drought year:
 * how soon will the tank overflow, and how soon will it run dry.
 */
final class Analytics {
    private Analytics() {}

    static final Duration TREND_WINDOW = Duration.ofHours(3);
    static final Duration OFFLINE_AFTER = Duration.ofHours(2);
    static final double OVERFLOW_FILL_PCT = 90.0;
    static final double LOW_FILL_PCT = 15.0;
    static final double MIN_SLOPE_LPH = 1.0; // ignore sensor noise below 1 L/h

    /** Least-squares slope (litres per hour) over readings in the trend window; NaN if under 2 points. */
    static double slopeLitresPerHour(List<Tank.Reading> readings, Instant now) {
        List<Tank.Reading> window = new ArrayList<>();
        for (Tank.Reading r : readings) if (!r.ts().isBefore(now.minus(TREND_WINDOW))) window.add(r);
        if (window.size() < 2) return Double.NaN;
        double t0 = window.get(0).ts().toEpochMilli() / 3_600_000.0;
        double n = window.size(), sx = 0, sy = 0, sxy = 0, sxx = 0;
        for (Tank.Reading r : window) {
            double x = r.ts().toEpochMilli() / 3_600_000.0 - t0;
            double y = r.levelLiters();
            sx += x; sy += y; sxy += x * y; sxx += x * x;
        }
        double denom = n * sxx - sx * sx;
        return Math.abs(denom) < 1e-9 ? Double.NaN : (n * sxy - sx * sy) / denom;
    }

    static Map<String, Object> status(Tank tank, Instant now) {
        List<Tank.Reading> readings = tank.snapshot();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", tank.id);
        out.put("name", tank.name);
        out.put("ownerId", tank.ownerId);
        out.put("shared", tank.shared);
        out.put("capacityLiters", tank.capacityLiters);
        out.put("createdAt", tank.createdAt.toString());
        out.put("readingCount", readings.size());

        if (readings.isEmpty()) {
            out.put("state", "no_data");
            out.put("message", "Waiting for the first sensor reading.");
            out.put("history", List.of());
            return out;
        }
        Tank.Reading latest = readings.get(readings.size() - 1);
        double fillPct = 100.0 * latest.levelLiters() / tank.capacityLiters;
        double slope = slopeLitresPerHour(readings, now);
        Double hoursToEmpty = null, hoursToFull = null;
        if (!Double.isNaN(slope)) {
            if (slope <= -MIN_SLOPE_LPH) hoursToEmpty = latest.levelLiters() / -slope;
            if (slope >= MIN_SLOPE_LPH) hoursToFull = Math.max(0, tank.capacityLiters - latest.levelLiters()) / slope;
        }

        String state, message;
        if (Duration.between(latest.ts(), now).compareTo(OFFLINE_AFTER) > 0) {
            state = "offline";
            message = "No reading for over 2 hours. Check the sensor.";
        } else if (fillPct >= OVERFLOW_FILL_PCT || (hoursToFull != null && hoursToFull <= 2.0)) {
            state = "overflow_risk";
            message = "Tank is nearly full or filling fast. Open the overflow to the recharge pit.";
        } else if (fillPct <= LOW_FILL_PCT || (hoursToEmpty != null && hoursToEmpty <= 24.0 && fillPct < 40.0)) {
            state = "low";
            message = "Water is running low. Ration non-essential use.";
        } else {
            state = "ok";
            message = "Level is healthy.";
        }

        Map<String, Object> latestMap = new LinkedHashMap<>();
        latestMap.put("ts", latest.ts().toString());
        latestMap.put("levelLiters", latest.levelLiters());
        if (latest.rainMm() != null) latestMap.put("rainMm", latest.rainMm());
        out.put("latest", latestMap);
        out.put("fillPct", Math.round(fillPct * 10) / 10.0);
        out.put("trendLitersPerHour", Double.isNaN(slope) ? null : Math.round(slope * 10) / 10.0);
        out.put("hoursToEmpty", hoursToEmpty == null ? null : Math.round(hoursToEmpty * 10) / 10.0);
        out.put("hoursToFull", hoursToFull == null ? null : Math.round(hoursToFull * 10) / 10.0);
        out.put("state", state);
        out.put("message", message);

        List<Map<String, Object>> history = new ArrayList<>();
        int step = Math.max(1, readings.size() / 120); // cap payload at ~120 points
        for (int i = 0; i < readings.size(); i += step) {
            Tank.Reading r = readings.get(i);
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("ts", r.ts().toString());
            p.put("levelLiters", r.levelLiters());
            history.add(p);
        }
        out.put("history", history);
        return out;
    }

    /** Summary without history, for list views. */
    static Map<String, Object> summary(Tank tank, Instant now) {
        Map<String, Object> s = new LinkedHashMap<>(status(tank, now));
        s.remove("history");
        return s;
    }
}
