<#
.SYNOPSIS
    Start-Database.ps1 - Database availability, configuration, and migration management script.

.DESCRIPTION
    Validates PostgreSQL configuration and connectivity for SOC Monitor:
    - Inspects .env configuration for DATABASE_URL.
    - If running on Windows with a local PostgreSQL service, checks service status and starts it if stopped.
    - Tests TCP connectivity to the database host and port (default 5432).
    - Tests authenticated database query execution.
    - Checks Alembic migration status and applies pending migrations if requested.
    - Never deletes, resets, or overwrites existing database data.

.PARAMETER ApplyMigrations
    Switch parameter to automatically apply pending Alembic schema migrations ('alembic upgrade head').

.PARAMETER ServiceName
    Name of the Windows PostgreSQL service (default: 'postgresql-x64-18', with auto-fallback to 'postgresql*').

.EXAMPLE
    .\scripts\Start-Database.ps1
    .\scripts\Start-Database.ps1 -ApplyMigrations
#>

[CmdletBinding()]
param(
    [switch]$ApplyMigrations,
    [string]$ServiceName = "postgresql-x64-18"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "        SOC Monitor — Database Service Inspector          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Inspect .env and DATABASE_URL
Write-Host "`n[1/4] Checking Database Configuration..." -ForegroundColor Yellow
$envPath = Join-Path $projectRoot ".env"

if (-not (Test-Path $envPath)) {
    Write-Warning "No .env file found in project root ($projectRoot)."
    Write-Host "Please copy .env.example to .env and configure your DATABASE_URL." -ForegroundColor Yellow
    exit 1
}

# Check if python is available
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    if (Test-Path "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe") {
        $env:Path = "$env:LOCALAPPDATA\Programs\Python\Python312;$env:LOCALAPPDATA\Programs\Python\Python312\Scripts;$env:Path"
    }
}

# Safely extract host, port, dbname using Python without printing credentials
$dbConfigCheck = python -c @"
import os
from urllib.parse import urlparse
try:
    from backend.app.core.config import settings
    raw_url = settings.DATABASE_URL
    if not raw_url:
        print('STATUS:MISSING')
        exit(0)
    # Normalize scheme for urllib.parse
    norm = raw_url.replace('postgresql+asyncpg://', 'postgresql://')
    parsed = urlparse(norm)
    host = parsed.hostname or 'localhost'
    port = parsed.port or 5432
    dbname = parsed.path.lstrip('/') if parsed.path else 'soc_monitor'
    user = parsed.username or 'postgres'
    print(f'STATUS:OK|HOST:{host}|PORT:{port}|DB:{dbname}|USER:{user}')
except Exception as e:
    print(f'STATUS:ERROR|MSG:{type(e).__name__}')
"@ 2>&1

$dbHost = "localhost"
$dbPort = 5432
$dbName = "soc_monitor"

if ($dbConfigCheck -match "STATUS:OK") {
    $parts = $dbConfigCheck -split "\|"
    foreach ($p in $parts) {
        if ($p -match "^HOST:(.+)") { $dbHost = $matches[1] }
        if ($p -match "^PORT:(.+)") { $dbPort = [int]$matches[1] }
        if ($p -match "^DB:(.+)") { $dbName = $matches[1] }
        if ($p -match "^USER:(.+)") { $dbUser = $matches[1] }
    }
    Write-Host "  [OK] Configuration detected for database '$dbName' on $dbHost`:$dbPort (User: $dbUser)" -ForegroundColor Green
} elseif ($dbConfigCheck -match "STATUS:MISSING") {
    Write-Error "DATABASE_URL is not set in .env. Please configure your database connection string."
    exit 1
} else {
    Write-Warning "Could not parse DATABASE_URL cleanly: $dbConfigCheck"
}

# 2. Check Local Windows Service (if host is localhost or 127.0.0.1)
Write-Host "`n[2/4] Checking PostgreSQL Service Status..." -ForegroundColor Yellow
if ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1") {
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $service) {
        $service = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
    }

    if ($service) {
        if ($service.Status -ne "Running") {
            Write-Host "  Service '$($service.Name)' is $($service.Status). Attempting to start..." -ForegroundColor Yellow
            try {
                Start-Service -Name $service.Name
                Start-Sleep -Seconds 2
                Write-Host "  [OK] Successfully started Windows Service '$($service.Name)'." -ForegroundColor Green
            } catch {
                Write-Warning "Could not start service '$($service.Name)' automatically: $_"
                Write-Host "Please start the PostgreSQL service via Services manager." -ForegroundColor Yellow
            }
        } else {
            Write-Host "  [OK] Windows Service '$($service.Name)' is already running." -ForegroundColor Green
        }
    } else {
        Write-Host "  [INFO] No native Windows PostgreSQL service found. Assuming standalone, custom, or Docker container." -ForegroundColor Gray
    }
} else {
    Write-Host "  [INFO] Remote database host ($dbHost) specified. Skipping local Windows service check." -ForegroundColor Gray
}

# 3. Test Database Connectivity
Write-Host "`n[3/4] Testing Authenticated Database Connection..." -ForegroundColor Yellow

$dbTest = python -c @"
import asyncio
from backend.app.db.session import engine
from sqlalchemy import text

async def check():
    try:
        async with engine.connect() as conn:
            res = await conn.execute(text('SELECT 1'))
            scalar = res.scalar()
            if scalar == 1:
                print('TEST:SUCCESS')
            else:
                print('TEST:UNEXPECTED')
    except Exception as e:
        print(f'TEST:FAILED|{type(e).__name__}|{str(e)}')

asyncio.run(check())
"@ 2>&1

if ($dbTest -match "TEST:SUCCESS") {
    Write-Host "  [OK] Successfully connected to PostgreSQL database '$dbName'." -ForegroundColor Green
} else {
    Write-Error "Database connection failed.`nDiagnostic details: $dbTest`nPlease verify that PostgreSQL is running and credentials in .env are correct."
    exit 1
}

# 4. Check Alembic Migrations
Write-Host "`n[4/4] Checking Schema Migration Status..." -ForegroundColor Yellow

Push-Location $projectRoot
try {
    $migrationCurrent = cmd /c "python -m alembic current 2>&1"
    Write-Host "  Current Revision: $migrationCurrent" -ForegroundColor Gray

    $migrationHeads = cmd /c "python -m alembic heads 2>&1"
    Write-Host "  Head Revision:    $migrationHeads" -ForegroundColor Gray

    if ($ApplyMigrations) {
        Write-Host "  Applying any pending schema migrations (alembic upgrade head)..." -ForegroundColor Cyan
        $upgradeResult = cmd /c "python -m alembic upgrade head 2>&1"
        Write-Host "  [OK] Migrations applied: $upgradeResult" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Run with -ApplyMigrations to automatically apply pending revisions if needed." -ForegroundColor Gray
    }
} finally {
    Pop-Location
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  Database is Verified and Ready for SOC Monitor Services " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
