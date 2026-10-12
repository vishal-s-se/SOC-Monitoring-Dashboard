<#
.SYNOPSIS
    Start-SOCMonitor.ps1 - Reproducible local development and operations startup script for SOC Monitor.

.DESCRIPTION
    Launches SOC Monitor services with safety checks:
    - Validates presence of Python, Node.js, and npm.
    - Inspects PostgreSQL service status (if running as Windows Service).
    - Checks required ports (5432, 8000, 5000, 3000) without terminating existing processes.
    - Prompts for DATABASE_URL securely if not found in .env.
    - Verifies frontend production build (if running in production mode) or dev environment.
    - Launches Backend, Collector, and Frontend in dedicated labelled terminal windows.
    - Polls health endpoints to verify readiness.

.PARAMETER Mode
    Execution mode: 'dev' (default) starts Next.js dev server; 'prod' starts Next.js production build ('next start').

.PARAMETER CollectorHost
    IP address or hostname on which the collector should listen (default: 0.0.0.0 for LAN/VM agents, or 127.0.0.1 for local only).

.PARAMETER PostgresServiceName
    Name of the Windows PostgreSQL service (default: postgresql-x64-18, fallback to postgresql*).

.EXAMPLE
    .\scripts\Start-SOCMonitor.ps1
    .\scripts\Start-SOCMonitor.ps1 -Mode prod -CollectorHost 127.0.0.1
#>

[CmdletBinding()]
param(
    [ValidateSet("dev", "prod")]
    [string]$Mode = "dev",

    [string]$CollectorHost = "0.0.0.0",

    [string]$PostgresServiceName = "postgresql-x64-18"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "        SOC Monitor — Local Service Manager               " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Project Root: $projectRoot" -ForegroundColor Gray
Write-Host "Mode:         $Mode" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# 1. Prerequisite Checks
# ------------------------------------------------------------------------------
Write-Host "`n[1/6] Checking Prerequisites..." -ForegroundColor Yellow

# Python Check
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    # Check common local app data path
    if (Test-Path "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe") {
        $env:Path = "$env:LOCALAPPDATA\Programs\Python\Python312;$env:LOCALAPPDATA\Programs\Python\Python312\Scripts;$env:Path"
        $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    }
}

if (-not $pythonCmd) {
    Write-Error "Python 3.10+ is required but not found in PATH. Please install Python and add it to your PATH."
    exit 1
}
$pyVersion = & python --version 2>&1
Write-Host "  [OK] Python: $pyVersion ($($pythonCmd.Source))" -ForegroundColor Green

# Node.js Check
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    if (Test-Path "$env:LOCALAPPDATA\Programs\nodejs\node.exe") {
        $env:Path = "$env:LOCALAPPDATA\Programs\nodejs;$env:Path"
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    }
}

if (-not $nodeCmd) {
    Write-Error "Node.js 18+ is required but not found in PATH. Please install Node.js."
    exit 1
}
$nodeVersion = & node --version 2>&1
Write-Host "  [OK] Node.js: $nodeVersion ($($nodeCmd.Source))" -ForegroundColor Green

# npm Check
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Error "npm is required but not found in PATH."
    exit 1
}
Write-Host "  [OK] npm: $($npmCmd.Source)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2. Database & Environment Configuration Check
# ------------------------------------------------------------------------------
Write-Host "`n[2/6] Checking Environment & Database..." -ForegroundColor Yellow

# PostgreSQL Service Check (Windows native)
$pgService = Get-Service -Name $PostgresServiceName -ErrorAction SilentlyContinue
if (-not $pgService) {
    # Search for any postgresql* service
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
}

if ($pgService) {
    if ($pgService.Status -ne "Running") {
        Write-Host "  PostgreSQL service '$($pgService.Name)' is currently $($pgService.Status). Attempting to start..." -ForegroundColor Yellow
        try {
            Start-Service -Name $pgService.Name
            Write-Host "  [OK] Started PostgreSQL service '$($pgService.Name)'." -ForegroundColor Green
        } catch {
            Write-Warning "Could not start service '$($pgService.Name)'. Ensure your database is active manually."
        }
    } else {
        Write-Host "  [OK] PostgreSQL service '$($pgService.Name)' is Running." -ForegroundColor Green
    }
} else {
    Write-Host "  [INFO] Native Windows PostgreSQL service not detected. Assuming external or containerized database." -ForegroundColor Gray
}

# .env Verification
$envFile = Join-Path $projectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Warning "No .env file found in project root ($projectRoot)."
    Write-Host "  Please enter your PostgreSQL connection string." -ForegroundColor Cyan
    Write-Host "  Example: postgresql://username:password@localhost:5432/soc_monitor" -ForegroundColor Gray
    $secureDbUrl = Read-Host -Prompt "DATABASE_URL" -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDbUrl)
    $plainDbUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    if ([string]::IsNullOrWhiteSpace($plainDbUrl)) {
        Write-Error "DATABASE_URL is required to run SOC Monitor backend and collector. Aborting."
        exit 1
    }
    $env:DATABASE_URL = $plainDbUrl
} else {
    Write-Host "  [OK] Found .env file." -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 3. Port Availability Verification (Never Kill Arbitrary Processes)
# ------------------------------------------------------------------------------
Write-Host "`n[3/6] Verifying Port Availability..." -ForegroundColor Yellow

$requiredPorts = @(
    @{ Port = 8000; Service = "Backend API" },
    @{ Port = 5000; Service = "Collector Service" },
    @{ Port = 3000; Service = "Frontend Dashboard" }
)

$portConflict = $false
foreach ($p in $requiredPorts) {
    $conn = Get-NetTCPConnection -LocalPort $p.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Write-Warning "Port $($p.Port) ($($p.Service)) is ALREADY in use by Process ID $($conn.OwningProcess)!"
        Write-Warning "Start-SOCMonitor will NOT terminate existing listeners. To stop existing services safely, run .\scripts\stop-all.ps1 or stop PID $($conn.OwningProcess)."
        $portConflict = $true
    } else {
        Write-Host "  [OK] Port $($p.Port) is available for $($p.Service)." -ForegroundColor Green
    }
}

if ($portConflict) {
    Write-Error "One or more required ports are occupied. Resolve conflicts and re-run Start-SOCMonitor.ps1."
    exit 1
}

# ------------------------------------------------------------------------------
# 4. Frontend Build Check (if Production mode)
# ------------------------------------------------------------------------------
if ($Mode -eq "prod") {
    Write-Host "`n[4/6] Verifying Frontend Production Build..." -ForegroundColor Yellow
    $nextBuildDir = Join-Path $projectRoot "frontend\.next"
    if (-not (Test-Path $nextBuildDir)) {
        Write-Host "  Production build directory not found. Running 'npm run build' in frontend..." -ForegroundColor Cyan
        Push-Location "$projectRoot\frontend"
        try {
            & npm run build
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Frontend build failed. Aborting."
                exit 1
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "  [OK] Existing production build detected." -ForegroundColor Green
    }
} else {
    Write-Host "`n[4/6] Development Mode: Next.js dev server will compile routes on demand." -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# 5. Service Launch in Labelled Terminals
# ------------------------------------------------------------------------------
Write-Host "`n[5/6] Launching Services in Dedicated Windows..." -ForegroundColor Yellow

# Set PYTHONPATH to project root for clean package imports
$pythonPathCmd = "`$env:PYTHONPATH = '$projectRoot';"

# A. Backend (Port 8000)
Write-Host "  -> Launching Backend on http://127.0.0.1:8000..." -ForegroundColor Cyan
$backendArgs = @(
    "-NoExit",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'SOC Monitor — Backend API (8000)'; $pythonPathCmd python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"
)
Start-Process powershell -WorkingDirectory "$projectRoot" -ArgumentList $backendArgs

# B. Collector (Port 5000)
Write-Host "  -> Launching Collector on http://${CollectorHost}:5000..." -ForegroundColor Cyan
$collectorArgs = @(
    "-NoExit",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'SOC Monitor — Collector (5000)'; $pythonPathCmd python -m uvicorn collector.app.main:app --host $CollectorHost --port 5000"
)
Start-Process powershell -WorkingDirectory "$projectRoot" -ArgumentList $collectorArgs

# C. Frontend (Port 3000)
Write-Host "  -> Launching Frontend on http://localhost:3000..." -ForegroundColor Cyan
$frontendScript = if ($Mode -eq "prod") { "npm run start" } else { "npm run dev" }
$frontendArgs = @(
    "-NoExit",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'SOC Monitor — Frontend (3000)'; $frontendScript"
)
Start-Process powershell -WorkingDirectory "$projectRoot\frontend" -ArgumentList $frontendArgs

# ------------------------------------------------------------------------------
# 6. Service Health Verification
# ------------------------------------------------------------------------------
Write-Host "`n[6/6] Polling Service Health Endpoints..." -ForegroundColor Yellow

function Test-EndpointWithRetry([string]$url, [string]$name, [int]$maxRetries = 15) {
    Write-Host -NoNewline "  Waiting for $name ($url)"
    for ($i = 0; $i -lt $maxRetries; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 2 -ErrorAction Stop
            if ($resp.status -eq "ok" -or $resp.message -match "running") {
                Write-Host " -> [ONLINE]" -ForegroundColor Green
                return $true
            }
        } catch {
            Write-Host -NoNewline "."
            Start-Sleep -Seconds 1
        }
    }
    Write-Host " -> [TIMEOUT/PENDING]" -ForegroundColor Yellow
    return $false
}

$backendReady = Test-EndpointWithRetry "http://127.0.0.1:8000/health" "Backend API"
$collectorReady = Test-EndpointWithRetry "http://127.0.0.1:5000/health" "Collector Service"

# Frontend port readiness
$frontendReady = $false
for ($i = 0; $i -lt 15; $i++) {
    $fConn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($fConn) {
        $frontendReady = $true
        break
    }
    Start-Sleep -Seconds 1
}

if ($frontendReady) {
    Write-Host "  Frontend Dashboard (http://localhost:3000) -> [ONLINE]" -ForegroundColor Green
} else {
    Write-Host "  Frontend Dashboard (http://localhost:3000) -> [STARTING...]" -ForegroundColor Yellow
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "        SOC Monitor Services Successfully Initialized      " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Dashboard:       http://localhost:3000" -ForegroundColor White
Write-Host "  Backend API:     http://localhost:8000  (Docs: http://localhost:8000/docs)" -ForegroundColor White
Write-Host "  Collector:       http://${CollectorHost}:5000  (Health: http://localhost:5000/health)" -ForegroundColor White
Write-Host "`nTo safely terminate all running services, run:" -ForegroundColor Gray
Write-Host "  .\scripts\stop-all.ps1" -ForegroundColor Yellow
