<#
.SYNOPSIS
    Start-Backend.ps1 - Validates Python runtime, dependencies, database availability, and launches FastAPI Backend API.

.DESCRIPTION
    Validates backend execution prerequisites:
    - Verifies Python 3.10+ installation.
    - Validates key Python package imports (fastapi, uvicorn, sqlalchemy, asyncpg, pydantic).
    - Checks port 8000 availability (never kills existing listeners).
    - Verifies database connectivity.
    - Launches FastAPI Backend API on specified host and port (default 127.0.0.1:8000).
    - Polls health endpoint to confirm successful startup.

.PARAMETER HostAddress
    Listening IP address for FastAPI backend (default: '127.0.0.1').

.PARAMETER Port
    Listening port (default: 8000).

.PARAMETER Reload
    Switch parameter to enable auto-reload during local development.

.EXAMPLE
    .\scripts\Start-Backend.ps1
    .\scripts\Start-Backend.ps1 -Reload
#>

[CmdletBinding()]
param(
    [string]$HostAddress = "127.0.0.1",
    [int]$Port = 8000,
    [switch]$Reload
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "        SOC Monitor — Backend API Service Launcher        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Project Root: $projectRoot" -ForegroundColor Gray
Write-Host "Target:       http://$HostAddress`:$Port" -ForegroundColor Gray

# 1. Check Python Environment
Write-Host "`n[1/5] Validating Python Runtime & Dependencies..." -ForegroundColor Yellow

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    if (Test-Path "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe") {
        $env:Path = "$env:LOCALAPPDATA\Programs\Python\Python312;$env:LOCALAPPDATA\Programs\Python\Python312\Scripts;$env:Path"
        $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    }
}

if (-not $pythonCmd) {
    Write-Error "Python 3.10+ is required but was not found in PATH."
    exit 1
}

$pyVer = & python --version 2>&1
Write-Host "  [OK] Python: $pyVer" -ForegroundColor Green

# Validate required packages
$pkgCheck = python -c @"
missing = []
for pkg in ['fastapi', 'uvicorn', 'sqlalchemy', 'asyncpg', 'pydantic']:
    try:
        __import__(pkg)
    except ImportError:
        missing.append(pkg)
if missing:
    print('MISSING:' + ','.join(missing))
else:
    print('ALL_PRESENT')
"@ 2>&1

if ($pkgCheck -match "MISSING:(.+)") {
    $missingList = $matches[1]
    Write-Error "Missing required Python packages: $missingList.`nPlease run: pip install -r backend/requirements.txt"
    exit 1
} else {
    Write-Host "  [OK] Core dependencies verified (fastapi, uvicorn, sqlalchemy, asyncpg, pydantic)." -ForegroundColor Green
}

# 2. Check Database Connectivity
Write-Host "`n[2/5] Verifying Database Reachability..." -ForegroundColor Yellow

$dbTest = python -c @"
import asyncio
try:
    from backend.app.db.session import engine
    from sqlalchemy import text
    async def t():
        async with engine.connect() as conn:
            await conn.execute(text('SELECT 1'))
            print('DB_OK')
    asyncio.run(t())
except Exception as e:
    print(f'DB_ERR:{type(e).__name__}')
"@ 2>&1

if ($dbTest -match "DB_OK") {
    Write-Host "  [OK] PostgreSQL database connection active." -ForegroundColor Green
} else {
    Write-Error "Database connection failed ($dbTest). Please start PostgreSQL or run .\scripts\Start-Database.ps1 first."
    exit 1
}

# 3. Check Port 8000 Availability
Write-Host "`n[3/5] Verifying Port $Port Availability..." -ForegroundColor Yellow

$existingConn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingConn) {
    Write-Error "Port $Port is already in use by Process ID $($existingConn.OwningProcess).`nStart-Backend will not kill existing processes. Stop PID $($existingConn.OwningProcess) or run .\scripts\stop-all.ps1 first."
    exit 1
}
Write-Host "  [OK] Port $Port is available." -ForegroundColor Green

# 4. Launch Backend API
Write-Host "`n[4/5] Launching Backend API..." -ForegroundColor Yellow

$reloadFlag = if ($Reload) { "--reload" } else { "" }
$pythonPathCmd = "`$env:PYTHONPATH = '$projectRoot';"

$backendArgs = @(
    "-NoExit",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'SOC Monitor — Backend API ($Port)'; $pythonPathCmd python -m uvicorn backend.app.main:app --host $HostAddress --port $Port $reloadFlag"
)

Start-Process powershell -WorkingDirectory "$projectRoot" -ArgumentList $backendArgs

# 5. Verify Health Endpoint
Write-Host "`n[5/5] Polling Backend Health (http://$HostAddress`:$Port/health)..." -ForegroundColor Yellow

$isHealthy = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri "http://$HostAddress`:$Port/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
        if ($resp.status -eq "ok") {
            $isHealthy = $true
            break
        }
    } catch {
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 1
    }
}

if ($isHealthy) {
    Write-Host "`n  [OK] Backend API is Online and Healthy!" -ForegroundColor Green
    Write-Host "  Documentation: http://$HostAddress`:$Port/docs" -ForegroundColor Cyan
    Write-Host "  Health:        http://$HostAddress`:$Port/health" -ForegroundColor Cyan
} else {
    Write-Host "`n  [INFO] Service process spawned. Health check still pending or initializing." -ForegroundColor Yellow
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  Backend Service Initialization Completed                " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
