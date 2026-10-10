param (
    [string]$CollectorHost = "127.0.0.1",
    [int]$CollectorPort = 5000,
    [string]$AuthToken = ""
)

$ErrorActionPreference = "Stop"
$ServiceName = "SOCMonitorAgent"
$ProgramDataPath = Join-Path $env:PROGRAMDATA "SOCMonitorAgent"
$ExecutablePath = Join-Path $ProgramDataPath "soc-agent-windows.exe"
$ConfigPath = Join-Path $ProgramDataPath "agent.yml"

Write-Host "Installing SOC Monitor Agent..."

# Ensure running as Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "Please run this script as Administrator."
    exit 1
}

# Create ProgramData directories
if (-not (Test-Path $ProgramDataPath)) {
    New-Item -ItemType Directory -Force -Path $ProgramDataPath | Out-Null
}

$StateDir = Join-Path $ProgramDataPath "state"
if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
}

# Copy executable
$SourceExe = Join-Path $PSScriptRoot "soc-agent-windows.exe"
if (-not (Test-Path $SourceExe)) {
    # If not in same folder, check dist folder for development
    $SourceExe = Join-Path $PSScriptRoot "..\dist\soc-agent-windows.exe"
}

if (Test-Path $SourceExe) {
    Copy-Item -Path $SourceExe -Destination $ExecutablePath -Force
} else {
    Write-Warning "Could not find soc-agent-windows.exe. Ensure it is in the same directory as this script."
    exit 1
}

# Generate configuration file
$ConfigContent = @"
collector:
  host: "$CollectorHost"
  port: $CollectorPort
  tls: false
  auth_token: "$AuthToken"

agent:
  id_file: "$ProgramDataPath\agent_id.txt"
  state_dir: "$ProgramDataPath\state"
  heartbeat_interval: 60
  buffer_max_events: 1000
  collection_interval: 5
  retry_max_delay: 60
  max_payload_bytes: 1048576

windows:
  channels:
    - "Security"
    - "System"
    - "Microsoft-Windows-Sysmon/Operational"
"@

Set-Content -Path $ConfigPath -Value $ConfigContent

Write-Host "Configuration saved to $ConfigPath"

# Register the service using PyInstaller service binary
Write-Host "Registering Windows Service..."
& $ExecutablePath install | Out-Null
& $ExecutablePath auto | Out-Null

# Start the service
Write-Host "Starting the service..."
Start-Service -Name $ServiceName

Write-Host "SOC Monitor Agent installed and started successfully!"
