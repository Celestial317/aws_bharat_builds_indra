package org.indra.telemetry;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** Container HEALTHCHECK helper: exits 0 if /healthz answers 200 (no curl in the slim image). */
public final class HealthProbe {
    private HealthProbe() {}

    public static void main(String[] args) {
        String port = System.getenv().getOrDefault("PORT", "8090");
        try {
            HttpResponse<Void> r = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/healthz")).timeout(Duration.ofSeconds(2)).build(),
                    HttpResponse.BodyHandlers.discarding());
            System.exit(r.statusCode() == 200 ? 0 : 1);
        } catch (Exception e) {
            System.exit(1);
        }
    }
}
