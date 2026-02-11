#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS_DIR="${ELO_FILES_PATH:-$ROOT_DIR}/logs"
HOSTS_FILE="$LOGS_DIR/nmap-hosts.txt"
HOST_SCAN_OUTPUT="$LOGS_DIR/nmap-hosts.gnmap"
HOST_SCAN_XML="$LOGS_DIR/nmap-hosts.xml"
NMAP_OUTPUT="$LOGS_DIR/nmap.gnmap"

export ELO_FILES_PATH="${ELO_FILES_PATH:-$ROOT_DIR}"

mkdir -p "$LOGS_DIR"
: > "$HOSTS_FILE"

SUBNETS=()
if [[ -n "${ELO_DISCOVERY_SUBNET:-}" ]]; then
  SUBNETS+=("${ELO_DISCOVERY_SUBNET}")
else
  while IFS= read -r cidr; do
    [[ -n "$cidr" ]] && SUBNETS+=("$cidr")
  done < <(ip -4 -o addr show scope global | awk '{print $4}')
fi

if [[ ${#SUBNETS[@]} -eq 0 ]]; then
  echo "[ELO] No IPv4 subnets detected; set ELO_DISCOVERY_SUBNET to override."
  exit 0
fi

TCP_PORTS="${ELO_NMAP_PORTS:-80,443,8080,554,8899,8000,8001,8002,1515,22}"
UDP_PORTS="${ELO_NMAP_UDP_PORTS:-4387,1900}"

rm -f "$HOST_SCAN_OUTPUT"
nmap -sn "${SUBNETS[@]}" -oX "$HOST_SCAN_XML"
for subnet in "${SUBNETS[@]}"; do
  nmap -sn "$subnet" -oG - | tee -a "$HOST_SCAN_OUTPUT" | awk '/Status: Up/{print $2}' >> "$HOSTS_FILE"
done

sort -u -o "$HOSTS_FILE" "$HOSTS_FILE"

if [[ ! -s "$HOSTS_FILE" ]]; then
  echo "[ELO] No hosts discovered by nmap."
  exit 0
fi

# Need root for MAC address detection usually, unless we parse ARP cache or use sudo.
# Assuming container has capabilities NET_ADMIN/NET_RAW as set in compose.
nmap -sn "${SUBNETS[@]}" -oX "$HOST_SCAN_XML"

nmap -sS -sU -p "T:$TCP_PORTS,U:$UDP_PORTS" -iL "$HOSTS_FILE" -oG "$NMAP_OUTPUT" --privileged

npx --yes ts-node "$ROOT_DIR/scripts/ingest-nmap.ts" --input "$HOST_SCAN_XML"
npx --yes ts-node "$ROOT_DIR/scripts/ingest-nmap.ts" --input "$HOST_SCAN_OUTPUT"
npx --yes ts-node "$ROOT_DIR/scripts/ingest-nmap.ts" --input "$NMAP_OUTPUT"

echo "[ELO] Nmap discovery complete. Results ingested into logs/events.jsonl"
