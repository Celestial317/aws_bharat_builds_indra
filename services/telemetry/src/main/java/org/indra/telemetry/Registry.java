package org.indra.telemetry;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/** In-memory tank registry with atomic JSON snapshotting so tanks and device keys survive restarts. */
final class Registry {
    static final int MAX_TANKS = 10_000;
    private static final SecureRandom RANDOM = new SecureRandom();

    record Created(Tank tank, String deviceKey) {}

    private final ConcurrentHashMap<String, Tank> tanks = new ConcurrentHashMap<>();
    private final AtomicBoolean dirty = new AtomicBoolean(false);
    private final Path file;

    Registry(Path file) {
        this.file = file;
    }

    // ------------------------------------------------------------------ keys
    static String newToken(int bytes) {
        byte[] raw = new byte[bytes];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    static String hash(String key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    boolean deviceKeyMatches(Tank tank, String presentedKey) {
        return presentedKey != null && constantTimeEquals(tank.deviceKeyHash, hash(presentedKey));
    }

    // ------------------------------------------------------------------ CRUD
    Created create(String name, String ownerId, double capacityLiters, boolean shared) {
        if (tanks.size() >= MAX_TANKS) throw new IllegalStateException("Tank limit reached");
        String key = newToken(24);
        Tank tank = new Tank("tnk_" + newToken(6), name, ownerId, capacityLiters, shared, hash(key), Instant.now());
        tanks.put(tank.id, tank);
        dirty.set(true);
        return new Created(tank, key);
    }

    Optional<Tank> get(String id) {
        return Optional.ofNullable(tanks.get(id));
    }

    List<Tank> list(String owner, boolean sharedOnly) {
        List<Tank> out = new ArrayList<>();
        for (Tank t : tanks.values()) {
            if (owner != null && !owner.equals(t.ownerId)) continue;
            if (sharedOnly && !t.shared) continue;
            out.add(t);
        }
        out.sort((a, b) -> a.createdAt.compareTo(b.createdAt));
        return out;
    }

    boolean delete(String id) {
        boolean removed = tanks.remove(id) != null;
        if (removed) dirty.set(true);
        return removed;
    }

    void markDirty() {
        dirty.set(true);
    }

    int size() {
        return tanks.size();
    }

    // ------------------------------------------------------------------ persistence
    void persistIfDirty() {
        if (file == null || !dirty.getAndSet(false)) return;
        List<Object> items = new ArrayList<>();
        for (Tank t : tanks.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.id);
            m.put("name", t.name);
            m.put("ownerId", t.ownerId);
            m.put("capacityLiters", t.capacityLiters);
            m.put("shared", t.shared);
            m.put("deviceKeyHash", t.deviceKeyHash);
            m.put("createdAt", t.createdAt.toString());
            List<Object> readings = new ArrayList<>();
            for (Tank.Reading r : t.snapshot()) {
                Map<String, Object> rm = new LinkedHashMap<>();
                rm.put("ts", r.ts().toString());
                rm.put("levelLiters", r.levelLiters());
                rm.put("rainMm", r.rainMm());
                readings.add(rm);
            }
            m.put("readings", readings);
            items.add(m);
        }
        try {
            Files.createDirectories(file.toAbsolutePath().getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, Json.write(Map.of("tanks", items)), StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            dirty.set(true);
            System.err.println("telemetry: snapshot failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    void load() {
        if (file == null || !Files.exists(file)) return;
        try {
            Map<String, Object> root = Json.parseObject(Files.readString(file, StandardCharsets.UTF_8));
            for (Object o : (List<Object>) root.getOrDefault("tanks", List.of())) {
                Map<String, Object> m = (Map<String, Object>) o;
                Tank t = new Tank((String) m.get("id"), (String) m.get("name"), (String) m.get("ownerId"),
                        ((Number) m.get("capacityLiters")).doubleValue(), Boolean.TRUE.equals(m.get("shared")),
                        (String) m.get("deviceKeyHash"), Instant.parse((String) m.get("createdAt")));
                for (Object ro : (List<Object>) m.getOrDefault("readings", List.of())) {
                    Map<String, Object> rm = (Map<String, Object>) ro;
                    Number rain = (Number) rm.get("rainMm");
                    t.add(new Tank.Reading(Instant.parse((String) rm.get("ts")),
                            ((Number) rm.get("levelLiters")).doubleValue(), rain == null ? null : rain.doubleValue()));
                }
                tanks.put(t.id, t);
            }
            System.out.println("telemetry: restored " + tanks.size() + " tanks from " + file);
        } catch (IOException | RuntimeException e) {
            System.err.println("telemetry: could not restore snapshot (" + e.getMessage() + "); starting empty");
        }
    }
}
