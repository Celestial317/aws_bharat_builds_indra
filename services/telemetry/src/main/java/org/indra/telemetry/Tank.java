package org.indra.telemetry;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/** A monitored water tank and its recent readings (bounded ring buffer). Thread-safe via synchronization. */
final class Tank {
    static final int MAX_READINGS = 720;

    record Reading(Instant ts, double levelLiters, Double rainMm) {}

    final String id;
    final String name;
    final String ownerId;
    final double capacityLiters;
    final boolean shared;
    final String deviceKeyHash;
    final Instant createdAt;
    private final Deque<Reading> readings = new ArrayDeque<>();

    Tank(String id, String name, String ownerId, double capacityLiters, boolean shared, String deviceKeyHash, Instant createdAt) {
        this.id = id;
        this.name = name;
        this.ownerId = ownerId;
        this.capacityLiters = capacityLiters;
        this.shared = shared;
        this.deviceKeyHash = deviceKeyHash;
        this.createdAt = createdAt;
    }

    synchronized void add(Reading reading) {
        // keep chronological order even if a sensor replays a slightly older sample
        List<Reading> tmp = new ArrayList<>(readings);
        tmp.add(reading);
        tmp.sort((a, b) -> a.ts().compareTo(b.ts()));
        readings.clear();
        int skip = Math.max(0, tmp.size() - MAX_READINGS);
        for (int i = skip; i < tmp.size(); i++) readings.addLast(tmp.get(i));
    }

    synchronized List<Reading> snapshot() {
        return new ArrayList<>(readings);
    }
}
