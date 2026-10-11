package org.indra.telemetry;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * INDRA tank telemetry service (Java 21 / Amazon Corretto).
 *
 * <pre>
 *   POST   /v1/tanks                  register a tank          (X-Service-Key)
 *   GET    /v1/tanks?owner=&amp;shared=true  list tanks           (X-Service-Key)
 *   GET    /v1/tanks/{id}             status + history         (X-Service-Key)
 *   DELETE /v1/tanks/{id}             remove a tank            (X-Service-Key)
 *   POST   /v1/tanks/{id}/readings    sensor reading           (X-Device-Key)
 *   GET    /healthz                   liveness
 * </pre>
 */
public final class Main {
    static final int MAX_BODY_BYTES = 8 * 1024;
    static final Duration MAX_FUTURE_SKEW = Duration.ofMinutes(5);

    private final Registry registry;
    private final String serviceKey;

    Main(Registry registry, String serviceKey) {
        this.registry = registry;
        this.serviceKey = serviceKey;
    }

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(env("PORT", "8090"));
        String key = env("TELEMETRY_SERVICE_KEY", "dev-service-key");
        boolean production = "production".equalsIgnoreCase(env("INDRA_ENV", "development"));
        if (production && key.equals("dev-service-key")) {
            System.err.println("telemetry: refusing to start in production with the default TELEMETRY_SERVICE_KEY");
            System.exit(1);
        }
        String store = env("TELEMETRY_STORE", "./data/telemetry.json");
        Registry registry = new Registry(store.isBlank() ? null : Path.of(store));
        registry.load();

        HttpServer server = start(port, registry, key);
        ScheduledExecutorService snapshots = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "snapshot");
            t.setDaemon(true);
            return t;
        });
        snapshots.scheduleWithFixedDelay(registry::persistIfDirty, 5, 5, TimeUnit.SECONDS);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            server.stop(1);
            registry.persistIfDirty();
        }));
        System.out.println("telemetry: listening on :" + port + " (Java " + Runtime.version().feature() + ")");
    }

    /** Starts the HTTP server (port 0 picks a free port; used by tests). */
    static HttpServer start(int port, Registry registry, String serviceKey) throws IOException {
        Main app = new Main(registry, serviceKey);
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 128);
        server.createContext("/", app::handle);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        return server;
    }

    static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null ? fallback : v;
    }

    // ------------------------------------------------------------------ routing
    void handle(HttpExchange ex) throws IOException {
        try {
            String path = ex.getRequestURI().getPath();
            String method = ex.getRequestMethod();
            if (path.equals("/healthz")) {
                send(ex, 200, Map.of("status", "ok", "tanks", registry.size()));
                return;
            }
            String[] seg = path.replaceAll("^/+|/+$", "").split("/");
            if (seg.length < 2 || !seg[0].equals("v1") || !seg[1].equals("tanks")) {
                error(ex, 404, "not_found", "No such route");
                return;
            }
            if (seg.length == 2) {
                if (method.equals("POST")) createTank(ex);
                else if (method.equals("GET")) listTanks(ex);
                else error(ex, 405, "method_not_allowed", "Use GET or POST");
            } else if (seg.length == 3) {
                if (method.equals("GET")) getTank(ex, seg[2]);
                else if (method.equals("DELETE")) deleteTank(ex, seg[2]);
                else error(ex, 405, "method_not_allowed", "Use GET or DELETE");
            } else if (seg.length == 4 && seg[3].equals("readings") && method.equals("POST")) {
                addReading(ex, seg[2]);
            } else {
                error(ex, 404, "not_found", "No such route");
            }
        } catch (Json.ParseException e) {
            error(ex, 400, "bad_json", e.getMessage());
        } catch (IllegalArgumentException e) {
            error(ex, 422, "invalid", e.getMessage());
        } catch (Exception e) {
            System.err.println("telemetry: unhandled " + e);
            error(ex, 500, "internal_error", "Internal error");
        } finally {
            ex.close();
        }
    }

    private boolean serviceAuthorized(HttpExchange ex) throws IOException {
        String presented = ex.getRequestHeaders().getFirst("X-Service-Key");
        if (presented != null && Registry.constantTimeEquals(serviceKey, presented)) return true;
        error(ex, 401, "unauthorized", "Missing or invalid X-Service-Key");
        return false;
    }

    // ------------------------------------------------------------------ handlers
    private void createTank(HttpExchange ex) throws IOException {
        if (!serviceAuthorized(ex)) return;
        Map<String, Object> body = Json.parseObject(readBody(ex));
        String name = requireString(body, "name", 80);
        String owner = requireString(body, "ownerId", 128);
        double capacity = requireNumber(body, "capacityLiters");
        if (capacity <= 0 || capacity > 10_000_000) throw new IllegalArgumentException("capacityLiters must be between 0 and 10,000,000");
        boolean shared = Boolean.TRUE.equals(body.get("shared"));
        Registry.Created created = registry.create(name, owner, capacity, shared);
        Map<String, Object> out = new LinkedHashMap<>(Analytics.summary(created.tank(), Instant.now()));
        out.put("deviceKey", created.deviceKey());
        send(ex, 201, out);
    }

    private void listTanks(HttpExchange ex) throws IOException {
        if (!serviceAuthorized(ex)) return;
        Map<String, String> q = query(ex);
        List<Object> items = new ArrayList<>();
        Instant now = Instant.now();
        for (Tank t : registry.list(q.get("owner"), "true".equals(q.get("shared")))) items.add(Analytics.summary(t, now));
        send(ex, 200, Map.of("tanks", items));
    }

    private void getTank(HttpExchange ex, String id) throws IOException {
        if (!serviceAuthorized(ex)) return;
        Optional<Tank> tank = registry.get(id);
        if (tank.isEmpty()) error(ex, 404, "not_found", "Tank not found");
        else send(ex, 200, Analytics.status(tank.get(), Instant.now()));
    }

    private void deleteTank(HttpExchange ex, String id) throws IOException {
        if (!serviceAuthorized(ex)) return;
        if (registry.delete(id)) send(ex, 204, null);
        else error(ex, 404, "not_found", "Tank not found");
    }

    private void addReading(HttpExchange ex, String id) throws IOException {
        Optional<Tank> found = registry.get(id);
        if (found.isEmpty()) {
            error(ex, 404, "not_found", "Tank not found");
            return;
        }
        Tank tank = found.get();
        if (!registry.deviceKeyMatches(tank, ex.getRequestHeaders().getFirst("X-Device-Key"))) {
            error(ex, 401, "unauthorized", "Missing or invalid X-Device-Key");
            return;
        }
        Map<String, Object> body = Json.parseObject(readBody(ex));
        double level = requireNumber(body, "levelLiters");
        if (level < 0 || level > tank.capacityLiters * 1.1) {
            throw new IllegalArgumentException("levelLiters must be between 0 and 110% of capacity (" + Math.round(tank.capacityLiters) + ")");
        }
        Double rain = body.get("rainMm") instanceof Number n ? n.doubleValue() : null;
        Instant ts = Instant.now();
        if (body.get("ts") instanceof String s) {
            try {
                ts = Instant.parse(s);
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException("ts must be ISO-8601, e.g. 2026-07-01T10:15:30Z");
            }
            if (ts.isAfter(Instant.now().plus(MAX_FUTURE_SKEW))) throw new IllegalArgumentException("ts is in the future");
        }
        tank.add(new Tank.Reading(ts, level, rain));
        registry.markDirty();
        send(ex, 202, Map.of("accepted", true));
    }

    // ------------------------------------------------------------------ helpers
    static String requireString(Map<String, Object> body, String key, int maxLen) {
        Object v = body.get(key);
        if (!(v instanceof String s) || s.isBlank() || s.length() > maxLen) {
            throw new IllegalArgumentException(key + " is required (1-" + maxLen + " chars)");
        }
        return s.strip();
    }

    static double requireNumber(Map<String, Object> body, String key) {
        if (!(body.get(key) instanceof Number n)) throw new IllegalArgumentException(key + " must be a number");
        double d = n.doubleValue();
        if (Double.isNaN(d) || Double.isInfinite(d)) throw new IllegalArgumentException(key + " must be finite");
        return d;
    }

    static String readBody(HttpExchange ex) throws IOException {
        try (InputStream in = ex.getRequestBody()) {
            byte[] data = in.readNBytes(MAX_BODY_BYTES + 1);
            if (data.length > MAX_BODY_BYTES) throw new IllegalArgumentException("Request body too large (max " + MAX_BODY_BYTES + " bytes)");
            return new String(data, StandardCharsets.UTF_8);
        }
    }

    static Map<String, String> query(HttpExchange ex) {
        Map<String, String> out = new LinkedHashMap<>();
        String raw = ex.getRequestURI().getRawQuery();
        if (raw == null) return out;
        for (String pair : raw.split("&")) {
            int i = pair.indexOf('=');
            String k = URLDecoder.decode(i < 0 ? pair : pair.substring(0, i), StandardCharsets.UTF_8);
            String v = i < 0 ? "" : URLDecoder.decode(pair.substring(i + 1), StandardCharsets.UTF_8);
            out.put(k, v);
        }
        return out;
    }

    static void error(HttpExchange ex, int status, String code, String message) throws IOException {
        send(ex, status, Map.of("error", Map.of("code", code, "message", message)));
    }

    static void send(HttpExchange ex, int status, Object body) throws IOException {
        if (body == null) {
            ex.sendResponseHeaders(status, -1);
            return;
        }
        byte[] bytes = Json.write(body).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
    }
}
