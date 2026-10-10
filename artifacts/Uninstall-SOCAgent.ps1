$ErrorActionPreference = "Stop"
$ServiceName = "SOCMonitorAgent"
$ProgramDataPath = Join-Path $env:PROGRAMDATA "SOCMonitorAgent"
$ExecutablePath = Join-Path $ProgramDataPath "soc-agent-windows.exe"

Write-Host "Uninstalling SOC Monitor Agent..."

# Ensure running as Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "Please run this script as Administrator."
    exit 1
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "Stopping service..."
    Stop-Service -Name $ServiceName -Force
    Write-Host "Removing service..."
    & $ExecutablePath remove | Out-Null
    Start-Sleep -Seconds 2
} else {
    Write-Host "Service not found."
}

# We intentionally do not delete $ProgramDataPath to preserve the agent_id and state
Write-Host "Service removed. Note: Configuration and agent identity in $ProgramDataPath have been preserved."
Write-Host "Uninstall complete."
