#!/bin/sh
# Home Kitchen — update to the latest version (keeps all data). Takes a backup first.
set -e
cd "$(dirname "$0")/.."
docker compose -f deploy/docker-compose.yml exec scheduler sh /app/deploy/scripts/backup.sh
git pull
docker compose -f deploy/docker-compose.yml up -d --build
echo "Updated. New database changes were applied automatically."
