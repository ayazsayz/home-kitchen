# Home Kitchen — update to the latest version (keeps all data). Takes a backup first.
$ErrorActionPreference = "Continue" # Docker/git print progress on stderr
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose -f deploy/docker-compose.yml exec scheduler sh /app/deploy/scripts/backup.sh
git pull
docker compose -f deploy/docker-compose.yml up -d --build
Write-Host "Updated. New database changes were applied automatically." -ForegroundColor Green
