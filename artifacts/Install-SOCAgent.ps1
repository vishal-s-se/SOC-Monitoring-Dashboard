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
$InternalDirPath = Join-Path $ProgramDataPath "_internal"

Write-Host "Installing SOC Monitor Agent..."

# 1. Administrator check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Administrator privileges are required. Please run PowerShell as Administrator."
    exit 1
}

# 2. Token handling: Trim whitespace and warn if empty
$AuthToken = $AuthToken.Trim()
if ([string]::IsNullOrWhiteSpace($AuthToken)) {
    Write-Warning "No AuthToken provided. Agent enrollment might fail without an active enrollment token."
}

# 3. Locate source directory relative to script root and check package integrity
$SourceDir = $PSScriptRoot
if (-not (Test-Path (Join-Path $SourceDir "soc-agent-windows.exe"))) {
    if (Test-Path (Join-Path $SourceDir "..\dist\soc-agent-windows.exe")) {
        $SourceDir = (Resolve-Path (Join-Path $SourceDir "..\dist")).Path
    }
}

$SourceExe = Join-Path $SourceDir "soc-agent-windows.exe"
$SourceInternal = Join-Path $SourceDir "_internal"

if (-not (Test-Path $SourceExe)) {
    Write-Error "Package validation failed: Could not find 'soc-agent-windows.exe' in '$SourceDir'. Ensure you extracted the complete soc-agent-windows.zip archive."
    exit 1
}

if (-not (Test-Path $SourceInternal)) {
    Write-Error "Package validation failed: Could not find required '_internal' directory in '$SourceDir'. Ensure you extracted the complete soc-agent-windows.zip archive, not just the exe."
    exit 1
}

$RequiredDll = Join-Path $SourceInternal "python312.dll"
if (-not (Test-Path $RequiredDll)) {
    Write-Error "Package validation failed: Missing required runtime 'python312.dll' in '$SourceInternal'. The installation package is incomplete."
    exit 1
}

Write-Host "Package validation passed. Source verified at '$SourceDir'."

# 4. Prepare target directories
if (-not (Test-Path $ProgramDataPath)) {
    New-Item -ItemType Directory -Force -Path $ProgramDataPath | Out-Null
}
$StateDir = Join-Path $ProgramDataPath "state"
if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
}

# 5. Stop existing service temporarily if updating binaries (preserves identity & state)
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService -and $existingService.Status -eq 'Running') {
    Write-Host "Existing $ServiceName service is running. Stopping temporarily for clean update..."
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 2
}

# 6. Copy binary and full runtime directory
Write-Host "Copying agent executable and complete '_internal' runtime..."
Copy-Item -Path $SourceExe -Destination $ExecutablePath -Force
Copy-Item -Path $SourceInternal -Destination $ProgramDataPath -Recurse -Force

# Verify runtime destination integrity
$DestDll = Join-Path $InternalDirPath "python312.dll"
if (-not (Test-Path $DestDll)) {
    Write-Error "Runtime verification failed: '$DestDll' not found after copy. Aborting installation."
    exit 1
}

# 7. Generate YAML safely with single quotes for backslash paths
function Escape-YamlSingleQuote([string]$val) {
    return $val -replace "'", "''"
}

$CollectorHostEscaped = Escape-YamlSingleQuote $CollectorHost
$AuthTokenEscaped = Escape-YamlSingleQuote $AuthToken
$IdFilePath = Join-Path $ProgramDataPath "agent_id.txt"
$IdFileEscaped = Escape-YamlSingleQuote $IdFilePath
$StateDirEscaped = Escape-YamlSingleQuote $StateDir

$ConfigContent = @"
collector:
  host: '$CollectorHostEscaped'
  port: $CollectorPort
  tls: false
  auth_token: '$AuthTokenEscaped'

agent:
  id_file: '$IdFileEscaped'
  state_dir: '$StateDirEscaped'
  heartbeat_interval: 60
  buffer_max_events: 1000
  collection_interval: 5
  retry_max_delay: 60
  max_payload_bytes: 1048576

windows:
  channels:
    - 'Security'
    - 'System'
    - 'Microsoft-Windows-Sysmon/Operational'
"@

# Write configuration atomically via temporary file
$TempConfigPath = "$ConfigPath.tmp-$([Guid]::NewGuid().ToString('N'))"
[System.IO.File]::WriteAllText($TempConfigPath, $ConfigContent, [System.Text.Encoding]::UTF8)
Move-Item -Path $TempConfigPath -Destination $ConfigPath -Force
Write-Host "Configuration saved to $ConfigPath."

# 8. Service registration and startup
Write-Host "Configuring Windows Service..."
& $ExecutablePath install | Out-Null
& $ExecutablePath auto | Out-Null

# Explicitly ensure Service Control Manager is configured for Automatic startup
try {
    Set-Service -Name $ServiceName -StartupType Automatic -ErrorAction SilentlyContinue
} catch {
    # Non-fatal if pyinstaller 'auto' already set it
}

# 9. Start the service and verify it is running
Write-Host "Starting $ServiceName service..."
Start-Service -Name $ServiceName

# Wait up to 10 seconds for service to reach and maintain Running state
$timeout = 10
$running = $false
for ($i = 0; $i -lt $timeout; $i++) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        $running = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $running) {
    Write-Error "$ServiceName failed to reach 'Running' status. Check '$ProgramDataPath\service.log' for diagnostic details."
    exit 1
}

Write-Host "SOC Monitor Agent installed, configured for Automatic startup, and running successfully!"
