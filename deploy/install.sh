#!/bin/sh
# Home Kitchen — install on Linux / macOS (Docker must be installed and running).
#   sh deploy/install.sh offline Asia/Karachi 3000
set -e
MODE="${1:-offline}"; TZNAME="${2:-Asia/Karachi}"; PORT="${3:-3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
docker info >/dev/null 2>&1 || { echo "Docker is not running."; exit 1; }
docker run --rm -v "$ROOT:/w" -w /w node:22-alpine node deploy/scripts/setup.mjs --mode "$MODE" --tz "$TZNAME" --port "$PORT"
docker compose -f deploy/docker-compose.yml up -d --build
echo "Waiting for the app to start..."
i=0; until curl -fs "http://localhost:$PORT/admin/login" >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 90 ] && break; sleep 5; done
printf "Create the owner login now? (y/n) "; read -r yn
if [ "$yn" = "y" ]; then
  printf "Owner email: "; read -r EMAIL
  printf "Owner name: "; read -r NAME
  stty -echo 2>/dev/null; printf "Password (8+ characters): "; read -r PW; stty echo 2>/dev/null; echo
  docker compose -f deploy/docker-compose.yml exec app node deploy/scripts/create-owner.mjs "$EMAIL" "$PW" "$NAME"
fi
echo "Done: http://localhost:$PORT/admin  (other devices: http://<this PC's IP>:$PORT/admin)"
