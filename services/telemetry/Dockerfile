# INDRA tank telemetry on Amazon Corretto 21.  Build:  finch build -t indra/telemetry services/telemetry
FROM amazoncorretto:21 AS build
WORKDIR /src
COPY src/main src/main
RUN mkdir /out && javac --release 21 -d /out $(find src/main -name '*.java')

FROM amazoncorretto:21-al2023-headless
RUN useradd --system --uid 10001 indra && mkdir -p /data && chown indra /data
COPY --from=build /out /app
USER indra
ENV PORT=8090 TELEMETRY_STORE=/data/telemetry.json JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8090
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s CMD ["java", "-cp", "/app", "org.indra.telemetry.HealthProbe"]
ENTRYPOINT ["java", "-cp", "/app", "org.indra.telemetry.Main"]
