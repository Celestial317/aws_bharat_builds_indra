#!/usr/bin/env bash
# Boot the telemetry microVM. Linux host with KVM only (/dev/kvm); not available on Windows/macOS.
#
# One-time prerequisites (see https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md):
#   * firecracker binary on PATH
#   * an uncompressed Linux kernel `vmlinux` in this directory (Firecracker's CI kernels work)
#   * ./build-rootfs.sh has produced rootfs.ext4
set -euo pipefail
cd "$(dirname "$0")"

[ -r /dev/kvm ] && [ -w /dev/kvm ] || { echo "/dev/kvm is not accessible: Firecracker needs KVM"; exit 1; }
command -v firecracker >/dev/null || { echo "firecracker not found on PATH"; exit 1; }
[ -f vmlinux ] || { echo "missing ./vmlinux kernel image"; exit 1; }
[ -f rootfs.ext4 ] || { echo "missing ./rootfs.ext4 - run ./build-rootfs.sh first"; exit 1; }

TAP=tap-indra
if ! ip link show "$TAP" >/dev/null 2>&1; then
  sudo ip tuntap add dev "$TAP" mode tap
  sudo ip addr add 172.16.0.1/24 dev "$TAP"
  sudo ip link set "$TAP" up
fi

SOCK=/tmp/indra-firecracker.sock
rm -f "$SOCK"
echo "Booting microVM; telemetry will answer on http://172.16.0.2:8090 (set TELEMETRY_URL accordingly)"
exec firecracker --api-sock "$SOCK" --config-file vm-config.json
