# Home Kitchen — install on a Windows PC/laptop (Docker Desktop must be installed and running).
# Right-click → Run with PowerShell, or:  powershell -ExecutionPolicy Bypass -File deploy\install.ps1 -Mode offline -TimeZone Asia/Karachi
param(
  [ValidateSet("offline", "docker")] [string]$Mode = "offline",
  [string]$TimeZone = "Asia/Karachi",
  [int]$Port = 3000
)
# Docker prints progress on stderr; Windows PowerShell would treat that as an error, so check exit codes instead.
$ErrorActionPreference = "Continue"
$deploy = $PSScriptRoot
$root = Split-Path $deploy -Parent
Set-Location $root

Write-Host "`n== Home Kitchen install ($Mode) ==" -ForegroundColor Cyan
$null = & docker version --format "{{.Server.Version}}" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker Desktop is not running. Start it, wait until it says 'Running', then run this again." -ForegroundColor Red; exit 1 }

# 1. Settings + secrets (deploy\.env), made inside Docker so Node isn't needed on the PC
docker run --rm -v "${root}:/w" -w /w node:22-alpine node deploy/scripts/setup.mjs --mode $Mode --tz $TimeZone --port $Port
if ($LASTEXITCODE -ne 0) { exit 1 }

# 2. Build the app and start everything (first time: downloads ~2-3 GB, takes 5-15 minutes)
docker compose -f deploy/docker-compose.yml up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host "Start failed. See: docker compose -f deploy/docker-compose.yml logs" -ForegroundColor Red; exit 1 }

Write-Host "Waiting for the app to start..."
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
  try { $null = Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/admin/login" -TimeoutSec 5 -ErrorAction Stop; $ok = $true; break } catch { Start-Sleep 5 }
}
if (-not $ok) { Write-Host "The app didn't answer yet. Check: docker compose -f deploy/docker-compose.yml logs app" -ForegroundColor Yellow }

# 3. First owner login (only if there is none yet)
$answer = Read-Host "Create the owner login now? (y/n)"
if ($answer -eq "y") {
  $email = Read-Host "Owner email (login)"
  $name = Read-Host "Owner name"
  $pw = Read-Host "Password (8+ characters)" -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
  docker compose -f deploy/docker-compose.yml exec app node deploy/scripts/create-owner.mjs $email $plain $name
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
Write-Host "`nDone." -ForegroundColor Green
Write-Host "  On this PC:          http://localhost:$Port/admin"
if ($ip) { Write-Host "  Other devices on Wi-Fi: http://${ip}:$Port/admin   (allow ports $Port and 8000 if Windows Firewall asks)" }
Write-Host "  Backups:             deploy\backups (change BACKUP_DIR in deploy\.env to use a USB drive)"
Write-Host "  Keep a copy of deploy\.env somewhere safe - it holds the database password."
