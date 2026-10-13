<#
.SYNOPSIS
    Start-Frontend.ps1 - Validates Node.js runtime, dependencies, API URL configuration, and launches Next.js dashboard.

.DESCRIPTION
    Validates frontend execution prerequisites:
    - Verifies Node.js 18+ and npm installation.
    - Inspects frontend node_modules and offers automatic 'npm install' if missing.
    - Inspects API URL configuration (NEXT_PUBLIC_API_URL).
    - Checks port 3000 availability (never kills existing listeners).
    - In production mode, checks for .next build folder or runs 'npm run build'.
    - Launches Next.js server in dedicated labelled terminal window.
    - Verifies dashboard HTTP readiness.

.PARAMETER Mode
    Execution mode: 'dev' (default) starts Next.js development server; 'prod' starts production build.

.PARAMETER Port
    Listening port (default: 3000).

.EXAMPLE
    .\scripts\Start-Frontend.ps1
    .\scripts\Start-Frontend.ps1 -Mode prod
#>

[CmdletBinding()]
param(
    [ValidateSet("dev", "prod")]
    [string]$Mode = "dev",
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$frontendDir = Join-Path $projectRoot "frontend"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "        SOC Monitor — Frontend Dashboard Launcher         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Frontend Dir: $frontendDir" -ForegroundColor Gray
Write-Host "Mode:         $Mode (Port $Port)" -ForegroundColor Gray

# 1. Validate Node.js & npm
Write-Host "`n[1/5] Validating Node.js & npm Runtime..." -ForegroundColor Yellow

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
$nodeVer = & node --version 2>&1
Write-Host "  [OK] Node.js: $nodeVer" -ForegroundColor Green

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Error "npm is required but not found in PATH."
    exit 1
}
$npmVer = & npm --version 2>&1
Write-Host "  [OK] npm:     v$npmVer" -ForegroundColor Green

# 2. Check node_modules dependencies
Write-Host "`n[2/5] Checking Frontend Dependencies..." -ForegroundColor Yellow
$nodeModulesDir = Join-Path $frontendDir "node_modules"

if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "  node_modules not found. Running 'npm install' in frontend directory..." -ForegroundColor Cyan
    Push-Location $frontendDir
    try {
        & npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm install failed. Aborting."
            exit 1
        }
    } finally {
        Pop-Location
    }
    Write-Host "  [OK] npm packages installed successfully." -ForegroundColor Green
} else {
    Write-Host "  [OK] node_modules directory verified." -ForegroundColor Green
}

# 3. Inspect API Target Configuration
Write-Host "`n[3/5] Inspecting API Configuration..." -ForegroundColor Yellow

$frontendEnvLocal = Join-Path $frontendDir ".env.local"
if (Test-Path $frontendEnvLocal) {
    $apiUrlLine = Get-Content $frontendEnvLocal | Where-Object { $_ -match "^NEXT_PUBLIC_API_URL=(.+)" }
    if ($apiUrlLine) {
        Write-Host "  [OK] Configured via frontend/.env.local: $apiUrlLine" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] frontend/.env.local present without NEXT_PUBLIC_API_URL. Using default: http://localhost:8000/api/v1" -ForegroundColor Gray
    }
} else {
    Write-Host "  [INFO] No frontend/.env.local found. Using default API target: http://localhost:8000/api/v1" -ForegroundColor Gray
    Write-Host "         (For cross-computer access, create frontend/.env.local with NEXT_PUBLIC_API_URL=http://<SERVER_IP>:8000/api/v1)" -ForegroundColor Gray
}

# 4. Check Port 3000 Availability
Write-Host "`n[4/5] Verifying Port $Port Availability..." -ForegroundColor Yellow

$existingConn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingConn) {
    Write-Error "Port $Port is already in use by Process ID $($existingConn.OwningProcess).`nStart-Frontend will not kill existing processes. Stop PID $($existingConn.OwningProcess) or run .\scripts\stop-all.ps1 first."
    exit 1
}
Write-Host "  [OK] Port $Port is available." -ForegroundColor Green

# In Production Mode, check build
if ($Mode -eq "prod") {
    $nextDir = Join-Path $frontendDir ".next"
    if (-not (Test-Path $nextDir)) {
        Write-Host "  Production build not found. Running 'npm run build'..." -ForegroundColor Cyan
        Push-Location $frontendDir
        try {
            & npm run build
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Frontend build failed. Aborting."
                exit 1
            }
        } finally {
            Pop-Location
        }
    }
}

# 5. Launch Dashboard
Write-Host "`n[5/5] Launching Frontend Dashboard..." -ForegroundColor Yellow

$startScript = if ($Mode -eq "prod") { "npm run start -- -p $Port" } else { "npm run dev -- -p $Port" }

$frontendArgs = @(
    "-NoExit",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'SOC Monitor — Frontend Dashboard ($Port)'; $startScript"
)

Start-Process powershell -WorkingDirectory "$frontendDir" -ArgumentList $frontendArgs

# Verify HTTP Reachability
Write-Host "  Waiting for Dashboard HTTP listener on port $Port..." -ForegroundColor Yellow
$isOnline = $false
for ($i = 0; $i -lt 15; $i++) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $isOnline = $true
        break
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
}

if ($isOnline) {
    Write-Host "`n  [OK] Frontend Dashboard is Listening!" -ForegroundColor Green
    Write-Host "  URL: http://localhost:$Port" -ForegroundColor Cyan
} else {
    Write-Host "`n  [INFO] Server launched. Port listener initializing." -ForegroundColor Yellow
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  Frontend Service Initialization Completed               " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
