param (
    [switch]$FullCleanup = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$ServiceName = "SOCMonitorAgent"
$ProgramDataPath = Join-Path $env:PROGRAMDATA "SOCMonitorAgent"
$ExecutablePath = Join-Path $ProgramDataPath "soc-agent-windows.exe"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " SOC Monitor Agent Windows Uninstaller    " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Ensure Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Administrator privileges required. Please run PowerShell as Administrator."
    exit 1
}

# 1. Stop and remove service
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -eq 'Running') {
        Write-Host "Stopping service $ServiceName..." -ForegroundColor Cyan
        Stop-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
    }
    Write-Host "Removing Windows service registration..." -ForegroundColor Cyan
    if (Test-Path $ExecutablePath) {
        & $ExecutablePath remove | Out-Null
    } else {
        # Fallback to sc.exe if executable was already removed
        & sc.exe delete $ServiceName | Out-Null
    }
    Start-Sleep -Seconds 2
    Write-Host "Service $ServiceName removed." -ForegroundColor Green
} else {
    Write-Host "Service $ServiceName not found." -ForegroundColor Yellow
}

# 2. Handle binaries and runtime cleanup
Write-Host "Removing executable and runtime dependencies..." -ForegroundColor Cyan
if (Test-Path $ExecutablePath) {
    Remove-Item -Path $ExecutablePath -Force -ErrorAction SilentlyContinue
}
$internalDir = Join-Path $ProgramDataPath "_internal"
if (Test-Path $internalDir) {
    Remove-Item -Path $internalDir -Recurse -Force -ErrorAction SilentlyContinue
}

# 3. State & Identity Preservation vs Full Cleanup
if ($FullCleanup) {
    if (-not $Force) {
        Write-Warning "CAUTION: Full cleanup will permanently delete local agent identity (agent_id.txt), config, and event buffers."
        $confirm = Read-Host "Are you sure you want to perform a FULL cleanup? (yes/NO)"
        if ($confirm -ne "yes") {
            Write-Host "Preserving local state and configuration directory." -ForegroundColor Green
            exit 0
        }
    }
    Write-Host "Removing all local state and configuration from $ProgramDataPath..." -ForegroundColor Yellow
    Remove-Item -Path $ProgramDataPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Full local cleanup completed." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Note: Agent configuration, persistent identity, and state in '$ProgramDataPath' have been PRESERVED." -ForegroundColor Green
    Write-Host "Historical events and investigation records on the SOC Monitor server remain intact." -ForegroundColor Green
    Write-Host "To remove local identity and state files completely, rerun with: .\uninstall-agent.ps1 -FullCleanup" -ForegroundColor Yellow
}

Write-Host "Uninstall complete." -ForegroundColor Green
