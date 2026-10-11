package org.indra.telemetry;

import com.sun.net.httpserver.HttpServer;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Dependency-free test runner: `java -cp out org.indra.telemetry.TelemetryTests` (exit code 1 on failure). */
public final class TelemetryTests {
    private static int passed = 0;
    private static final List<String> failures = new java.util.ArrayList<>();

    interface Check { void run() throws Exception; }

    static void test(String name, Check check) {
        try {
            check.run();
            passed++;
            System.out.println("  ok   " + name);
        } catch (Throwable t) {
            failures.add(name + ": " + t);
            System.out.println("  FAIL " + name + " -> " + t);
        }
    }

    static void eq(Object expected, Object actual) {
        if (!java.util.Objects.equals(expected, actual)) throw new AssertionError("expected <" + expected + "> but was <" + actual + ">");
    }

    static void yes(boolean cond, String msg) {
        if (!cond) throw new AssertionError(msg);
    }

    static Tank tank(double capacity) {
        return new Tank("t1", "Roof tank", "asha", capacity, false, "hash", Instant.now());
    }

    static void feed(Tank t, Instant now, double startLevel, double litresPerHour, int hours) {
        for (int m = hours * 60; m >= 0; m -= 10) {
            double level = startLevel + litresPerHour * (hours - m / 60.0);
            t.add(new Tank.Reading(now.minus(Duration.ofMinutes(m)), level, null));
        }
    }

    public static void main(String[] args) throws Exception {
        System.out.println("JSON");
        test("parses nested documents", () -> {
            Map<String, Object> m = Json.parseObject("{\"a\":[1,2.5,{\"b\":null}],\"s\":\"x\\ny\\u0041\",\"t\":true}");
            eq(List.of(1.0, 2.5, java.util.Collections.singletonMap("b", null)).size(), ((List<?>) m.get("a")).size());
            eq("x\nyA", m.get("s"));
            eq(Boolean.TRUE, m.get("t"));
        });
        test("round-trips through the writer", () -> {
            String out = Json.write(Map.of("k", List.of(1, "two", false)));
            eq("{\"k\":[1,\"two\",false]}", out);
            eq("\"a\\\"b\\\\c\\n\"", Json.write("a\"b\\c\n"));
        });
        test("rejects malformed and hostile input", () -> {
            for (String bad : new String[]{"", "{", "{\"a\":}", "[1,", "{\"a\":1} x", "nul", "{\"a\":\"\\q\"}"}) {
                try {
                    Json.parse(bad);
                    throw new AssertionError("accepted: " + bad);
                } catch (Json.ParseException expected) { /* ok */ }
            }
            try {
                Json.parse("[".repeat(100) + "]".repeat(100));
                throw new AssertionError("accepted deep nesting");
            } catch (Json.ParseException expected) { /* ok */ }
        });

        System.out.println("Analytics");
        Instant now = Instant.parse("2026-07-01T12:00:00Z");
        test("no readings -> no_data", () -> eq("no_data", Analytics.status(tank(1000), now).get("state")));
        test("steady mid level is ok", () -> {
            Tank t = tank(1000);
            feed(t, now, 500, 0.0, 3);
            eq("ok", Analytics.status(t, now).get("state"));
        });
        test("fast filling predicts overflow", () -> {
            Tank t = tank(1000);
            feed(t, now, 400, 100, 3);                      // 400 -> 700, +100 L/h, full in 3 h
            Map<String, Object> s = Analytics.status(t, now);
            eq("ok", s.get("state"));                        // 3 h away: not yet urgent
            Tank t2 = tank(1000);
            feed(t2, now, 600, 160, 2);                     // 600 -> 920
            eq("overflow_risk", Analytics.status(t2, now).get("state"));
        });
        test("draining tank warns before it is dry", () -> {
            Tank t = tank(1000);
            feed(t, now, 350, -20, 3);                      // 350 -> 290 at -20 L/h => ~14 h left
            Map<String, Object> s = Analytics.status(t, now);
            eq("low", s.get("state"));
            double h = ((Number) s.get("hoursToEmpty")).doubleValue();
            yes(h > 12 && h < 16, "hoursToEmpty=" + h);
        });
        test("empty tank is low", () -> {
            Tank t = tank(1000);
            t.add(new Tank.Reading(now, 50, null));
            eq("low", Analytics.status(t, now).get("state"));
        });
        test("stale sensor is offline", () -> {
            Tank t = tank(1000);
            t.add(new Tank.Reading(now.minus(Duration.ofHours(5)), 500, null));
            eq("offline", Analytics.status(t, now).get("state"));
        });
        test("sensor noise does not create a trend", () -> {
            Tank t = tank(1000);
            feed(t, now, 500, 0.2, 3);
            Map<String, Object> s = Analytics.status(t, now);
            yes(s.get("hoursToEmpty") == null && s.get("hoursToFull") == null, "noise produced an ETA");
        });
        test("ring buffer is bounded and ordered", () -> {
            Tank t = tank(1000);
            for (int i = 0; i < Tank.MAX_READINGS + 50; i++) t.add(new Tank.Reading(now.plusSeconds(i), 10, null));
            t.add(new Tank.Reading(now.minusSeconds(100), 10, null));   // late arrival goes to the front, then evicted
            List<Tank.Reading> r = t.snapshot();
            eq(Tank.MAX_READINGS, r.size());
            for (int i = 1; i < r.size(); i++) yes(!r.get(i).ts().isBefore(r.get(i - 1).ts()), "not chronological");
        });

        System.out.println("HTTP API");
        Path snapshot = Files.createTempFile("telemetry", ".json");
        Files.deleteIfExists(snapshot);
        Registry registry = new Registry(snapshot);
        HttpServer server = Main.start(0, registry, "svc-key");
        String base = "http://localhost:" + server.getAddress().getPort();
        HttpClient http = HttpClient.newHttpClient();
        String[] created = new String[2]; // id, deviceKey

        test("healthz is public", () -> eq(200, call(http, "GET", base + "/healthz", null, Map.of()).statusCode()));
        test("registry calls need the service key", () -> {
            eq(401, call(http, "GET", base + "/v1/tanks", null, Map.of()).statusCode());
            eq(401, call(http, "GET", base + "/v1/tanks", null, Map.of("X-Service-Key", "wrong")).statusCode());
        });
        test("register a tank and receive a one-time device key", () -> {
            HttpResponse<String> r = call(http, "POST", base + "/v1/tanks",
                    "{\"name\":\"Terrace\",\"ownerId\":\"asha\",\"capacityLiters\":1000,\"shared\":true}", Map.of("X-Service-Key", "svc-key"));
            eq(201, r.statusCode());
            Map<String, Object> body = Json.parseObject(r.body());
            created[0] = (String) body.get("id");
            created[1] = (String) body.get("deviceKey");
            yes(created[1].length() >= 30, "device key too short");
            eq("no_data", body.get("state"));
            yes(!snapshotContains(registry, created[1]), "plain device key must never be persisted");
        });
        test("validates tank registration", () -> {
            eq(422, call(http, "POST", base + "/v1/tanks", "{\"name\":\"\",\"ownerId\":\"a\",\"capacityLiters\":10}", Map.of("X-Service-Key", "svc-key")).statusCode());
            eq(422, call(http, "POST", base + "/v1/tanks", "{\"name\":\"x\",\"ownerId\":\"a\",\"capacityLiters\":-5}", Map.of("X-Service-Key", "svc-key")).statusCode());
            eq(400, call(http, "POST", base + "/v1/tanks", "{not json", Map.of("X-Service-Key", "svc-key")).statusCode());
        });
        test("readings need the device key, not the service key", () -> {
            String url = base + "/v1/tanks/" + created[0] + "/readings";
            eq(401, call(http, "POST", url, "{\"levelLiters\":100}", Map.of()).statusCode());
            eq(401, call(http, "POST", url, "{\"levelLiters\":100}", Map.of("X-Service-Key", "svc-key")).statusCode());
            eq(202, call(http, "POST", url, "{\"levelLiters\":100}", Map.of("X-Device-Key", created[1])).statusCode());
        });
        test("rejects impossible readings", () -> {
            String url = base + "/v1/tanks/" + created[0] + "/readings";
            eq(422, call(http, "POST", url, "{\"levelLiters\":5000}", Map.of("X-Device-Key", created[1])).statusCode());
            eq(422, call(http, "POST", url, "{\"levelLiters\":-1}", Map.of("X-Device-Key", created[1])).statusCode());
            eq(422, call(http, "POST", url, "{\"levelLiters\":10,\"ts\":\"2999-01-01T00:00:00Z\"}", Map.of("X-Device-Key", created[1])).statusCode());
            eq(422, call(http, "POST", url, "{\"levelLiters\":10,\"ts\":\"yesterday\"}", Map.of("X-Device-Key", created[1])).statusCode());
        });
        test("oversized bodies are refused", () -> {
            String url = base + "/v1/tanks/" + created[0] + "/readings";
            String huge = "{\"levelLiters\":1,\"pad\":\"" + "x".repeat(10_000) + "\"}";
            eq(422, call(http, "POST", url, huge, Map.of("X-Device-Key", created[1])).statusCode());
        });
        test("status reflects the latest reading; owner filter and shared filter work", () -> {
            HttpResponse<String> r = call(http, "GET", base + "/v1/tanks/" + created[0], null, Map.of("X-Service-Key", "svc-key"));
            Map<String, Object> s = Json.parseObject(r.body());
            eq("low", s.get("state"));
            eq(10.0, ((Number) s.get("fillPct")).doubleValue());
            Map<String, Object> mine = Json.parseObject(call(http, "GET", base + "/v1/tanks?owner=asha", null, Map.of("X-Service-Key", "svc-key")).body());
            eq(1, ((List<?>) mine.get("tanks")).size());
            Map<String, Object> other = Json.parseObject(call(http, "GET", base + "/v1/tanks?owner=ravi", null, Map.of("X-Service-Key", "svc-key")).body());
            eq(0, ((List<?>) other.get("tanks")).size());
            Map<String, Object> shared = Json.parseObject(call(http, "GET", base + "/v1/tanks?shared=true", null, Map.of("X-Service-Key", "svc-key")).body());
            eq(1, ((List<?>) shared.get("tanks")).size());
        });
        test("snapshot survives a restart", () -> {
            registry.persistIfDirty();
            Registry reloaded = new Registry(snapshot);
            reloaded.load();
            Tank t = reloaded.get(created[0]).orElseThrow();
            yes(reloaded.deviceKeyMatches(t, created[1]), "device key hash lost");
            eq(1, t.snapshot().size());
        });
        test("delete removes the tank", () -> {
            eq(204, call(http, "DELETE", base + "/v1/tanks/" + created[0], null, Map.of("X-Service-Key", "svc-key")).statusCode());
            eq(404, call(http, "GET", base + "/v1/tanks/" + created[0], null, Map.of("X-Service-Key", "svc-key")).statusCode());
        });
        test("unknown routes are 404", () -> eq(404, call(http, "GET", base + "/nope", null, Map.of()).statusCode()));

        server.stop(0);
        Files.deleteIfExists(snapshot);
        System.out.println();
        System.out.println(passed + " passed, " + failures.size() + " failed");
        if (!failures.isEmpty()) {
            failures.forEach(f -> System.out.println("  - " + f));
            System.exit(1);
        }
    }

    static boolean snapshotContains(Registry registry, String needle) throws Exception {
        registry.persistIfDirty();
        java.lang.reflect.Field f = Registry.class.getDeclaredField("file");
        f.setAccessible(true);
        Path p = (Path) f.get(registry);
        return Files.exists(p) && Files.readString(p).contains(needle);
    }

    static HttpResponse<String> call(HttpClient http, String method, String url, String body, Map<String, String> headers) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5));
        headers.forEach(b::header);
        b.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }
}
