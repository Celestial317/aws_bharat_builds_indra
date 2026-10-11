#!/usr/bin/env bash
# Turn the Corretto telemetry container image into a bootable ext4 root filesystem for Firecracker.
# Needs: finch (or docker), e2fsprogs >= 1.43 (mkfs.ext4 -d), and root for the loop-free ext4 build.
#
#   TELEMETRY_SERVICE_KEY=$(openssl rand -hex 24) ./deploy/firecracker/build-rootfs.sh
set -euo pipefail

CONTAINER="${CONTAINER:-finch}"
IMAGE="${IMAGE:-indra/telemetry:microvm}"
SIZE_MB="${SIZE_MB:-768}"
OUT="${OUT:-$(dirname "$0")/rootfs.ext4}"
KEY="${TELEMETRY_SERVICE_KEY:?set TELEMETRY_SERVICE_KEY (the microVM has no other way to receive secrets)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

"$CONTAINER" build -t "$IMAGE" "$ROOT/services/telemetry"
CID="$("$CONTAINER" create "$IMAGE")"
STAGE="$(mktemp -d)"
trap '"$CONTAINER" rm -f "$CID" >/dev/null 2>&1 || true; rm -rf "$STAGE"' EXIT

"$CONTAINER" export "$CID" | tar -C "$STAGE" -xf -
mkdir -p "$STAGE"/{proc,sys,dev,tmp,data,etc/indra}
printf '%s' "$KEY" > "$STAGE/etc/indra/service-key"
chmod 600 "$STAGE/etc/indra/service-key"

cat > "$STAGE/init" <<'INIT'
#!/bin/sh
# Minimal PID 1 for the microVM: mount pseudo filesystems, then run the telemetry service.
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t devtmpfs devtmpfs /dev 2>/dev/null
mount -t tmpfs tmpfs /tmp
ip link set lo up 2>/dev/null || true
JAVA="$(ls -d /usr/lib/jvm/java-21-amazon-corretto*/bin/java 2>/dev/null | head -1)"
export PORT=8090 TELEMETRY_STORE=/data/telemetry.json INDRA_ENV=production
export TELEMETRY_SERVICE_KEY="$(cat /etc/indra/service-key)"
exec "${JAVA:-java}" -XX:MaxRAMPercentage=70 -cp /app org.indra.telemetry.Main
INIT
chmod +x "$STAGE/init"

rm -f "$OUT"
truncate -s "${SIZE_MB}M" "$OUT"
mkfs.ext4 -q -d "$STAGE" -L indra-root "$OUT"
echo "rootfs written to $OUT"
