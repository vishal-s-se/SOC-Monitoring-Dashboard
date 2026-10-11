param (
    [string]$CollectorHost = "127.0.0.1",
    [int]$CollectorPort = 5000,
    [string]$AuthToken = "",
    [switch]$Repair = $false,
    [string]$DownloadUrl = ""
)

$ErrorActionPreference = "Stop"
$ServiceName = "SOCMonitorAgent"
$ProgramDataPath = Join-Path $env:PROGRAMDATA "SOCMonitorAgent"
$ExecutablePath = Join-Path $ProgramDataPath "soc-agent-windows.exe"
$ConfigPath = Join-Path $ProgramDataPath "agent.yml"
$InternalDirPath = Join-Path $ProgramDataPath "_internal"
$InstalledUninstaller = Join-Path $ProgramDataPath "uninstall-agent.ps1"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " SOC Monitor Agent Windows Installer      " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

function Cleanup-TokenEnvironment {
    Remove-Item Env:AGENTAUTHTOKEN -ErrorAction SilentlyContinue
    $env:AGENTAUTHTOKEN = $null
}

try {
# 1. Administrator check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Cleanup-TokenEnvironment
    Write-Error "Administrator privileges required. Please re-run PowerShell as Administrator."
    exit 1
}

# 2. Token resolution & validation
# Priority 1: $AuthToken parameter if passed explicitly
# Priority 2: $env:AGENTAUTHTOKEN environment variable
# Priority 3: Interactive secure masked prompt (if not in Repair mode with existing config)
if ([string]::IsNullOrWhiteSpace($AuthToken) -and (-not [string]::IsNullOrWhiteSpace($env:AGENTAUTHTOKEN))) {
    $AuthToken = $env:AGENTAUTHTOKEN.Trim()
    if ($AuthToken -eq "System.Security.SecureString") {
        Cleanup-TokenEnvironment
        Write-Error "Invalid token format: AGENTAUTHTOKEN contains literal 'System.Security.SecureString'. Please set AGENTAUTHTOKEN as a plain text string or leave it unset to prompt interactively."
        exit 1
    }
} elseif (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
    $AuthToken = $AuthToken.Trim()
}

if ([string]::IsNullOrWhiteSpace($AuthToken)) {
    # Check if this is an upgrade/repair of an existing configured installation
    if ($Repair -and (Test-Path $ConfigPath)) {
        Write-Host "Repair mode: Preserving existing configuration and agent identity." -ForegroundColor Green
    } else {
        Write-Host "Please enter your one-time enrollment token from the SOC Monitor dashboard." -ForegroundColor Yellow
        $secureInput = Read-Host "Enrollment Token (hidden)" -AsSecureString
        if ($secureInput) {
            $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput)
            try {
                $AuthToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
            } finally {
                [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
            }
            if ($AuthToken) {
                $AuthToken = $AuthToken.Trim()
            }
        }

        if ([string]::IsNullOrWhiteSpace($AuthToken)) {
            Cleanup-TokenEnvironment
            Write-Error "Enrollment token cannot be empty. Aborting installation."
            exit 1
        }
    }
}

# 3. Locate or download package relative to script directory
$SourceDir = $PSScriptRoot
if (-not $SourceDir) { $SourceDir = Get-Location }

# Optional remote download mode if invoked from bootstrap one-liner
if ($DownloadUrl -and (-not (Test-Path (Join-Path $SourceDir "soc-agent-windows.exe")))) {
    Write-Host "Downloading release package from $DownloadUrl..." -ForegroundColor Cyan
    $tempZip = Join-Path $env:TEMP "soc-agent-windows-$([Guid]::NewGuid().ToString('N')).zip"
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $tempZip -UseBasicParsing
    $tempExtract = Join-Path $env:TEMP "soc-agent-extract-$([Guid]::NewGuid().ToString('N'))"
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    $SourceDir = $tempExtract
}

# Check relative package paths
if (-not (Test-Path (Join-Path $SourceDir "soc-agent-windows.exe"))) {
    if (Test-Path (Join-Path $SourceDir "soc-agent-windows\soc-agent-windows.exe")) {
        $SourceDir = Join-Path $SourceDir "soc-agent-windows"
    } elseif (Test-Path (Join-Path $SourceDir "..\dist\soc-agent-windows.exe")) {
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
    Write-Error "Package validation failed: Could not find required '_internal' runtime directory in '$SourceDir'."
    exit 1
}

$RequiredDll = Join-Path $SourceInternal "python312.dll"
if (-not (Test-Path $RequiredDll)) {
    Write-Error "Package validation failed: Missing required runtime '$RequiredDll'."
    exit 1
}

Write-Host "Package verification passed (Source: $SourceDir)." -ForegroundColor Green

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
    Write-Host "Existing $ServiceName service is running. Stopping temporarily for clean update..." -ForegroundColor Cyan
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 2
}

# 6. Copy binary and complete '_internal' runtime
Write-Host "Copying runtime files to $ProgramDataPath..." -ForegroundColor Cyan
Copy-Item -Path $SourceExe -Destination $ExecutablePath -Force
Copy-Item -Path $SourceInternal -Destination $ProgramDataPath -Recurse -Force

# Verify destination integrity
$DestDll = Join-Path $InternalDirPath "python312.dll"
if (-not (Test-Path $DestDll)) {
    Write-Error "Runtime verification failed: '$DestDll' missing after copy. Aborting installation."
    exit 1
}

# 7. Generate YAML safely with proper single-quoted Windows paths
function Escape-YamlScalar([string]$val) {
    return ($val -replace "'", "''")
}

$CollectorHostEscaped = Escape-YamlScalar $CollectorHost
$AuthTokenEscaped = Escape-YamlScalar $AuthToken
$IdFilePath = Join-Path $ProgramDataPath "agent_id.txt"
$IdFileEscaped = Escape-YamlScalar $IdFilePath
$StateDirEscaped = Escape-YamlScalar $StateDir

# If not in repair mode with existing config, write atomic new config
if ((-not $Repair) -or (-not (Test-Path $ConfigPath))) {
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

    $TempConfigPath = "$ConfigPath.tmp-$([Guid]::NewGuid().ToString('N'))"
    [System.IO.File]::WriteAllText($TempConfigPath, $ConfigContent, [System.Text.Encoding]::UTF8)
    Move-Item -Path $TempConfigPath -Destination $ConfigPath -Force
    Write-Host "Configuration saved atomically to $ConfigPath." -ForegroundColor Green
}

# Copy uninstaller script to installed directory
$SourceUninstaller = Join-Path $PSScriptRoot "uninstall-agent.ps1"
if (-not (Test-Path $SourceUninstaller)) {
    $SourceUninstaller = Join-Path $PSScriptRoot "Uninstall-SOCAgent.ps1"
}
if (Test-Path $SourceUninstaller) {
    Copy-Item -Path $SourceUninstaller -Destination $InstalledUninstaller -Force
    Write-Host "Uninstaller stored at $InstalledUninstaller." -ForegroundColor Green
}

# 8. Service registration and automatic startup
Write-Host "Registering Windows service..." -ForegroundColor Cyan
& $ExecutablePath install | Out-Null
& $ExecutablePath auto | Out-Null

try {
    Set-Service -Name $ServiceName -StartupType Automatic -ErrorAction SilentlyContinue
} catch {}

# 9. Start service and verify running status
Write-Host "Starting $ServiceName..." -ForegroundColor Cyan
Start-Service -Name $ServiceName

$timeout = 15
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
    Cleanup-TokenEnvironment
    Write-Error "$ServiceName failed to reach 'Running' state. Check '$ProgramDataPath\service.log' for diagnostic details."
    exit 1
}

# Verify enrollment registration in agent.log if available
Start-Sleep -Seconds 2
$AgentLogPath = Join-Path $ProgramDataPath "agent.log"
if (Test-Path $AgentLogPath) {
    $recentLog = Get-Content -Tail 25 -Path $AgentLogPath -ErrorAction SilentlyContinue | Out-String
    if ($recentLog -match "Invalid or expired enrollment code|401 Client Error|registration rejected") {
        Cleanup-TokenEnvironment
        Write-Error "Enrollment failed: The server rejected the enrollment token as invalid or expired. Enrollment tokens are single-use and expire after 24 hours. Please generate a fresh token from the SOC Monitor dashboard."
        exit 1
    }
}

Write-Host "============================================================" -ForegroundColor Green
Write-Host " SOC Monitor Agent successfully installed and running!      " -ForegroundColor Green
Write-Host " Service Name : $ServiceName (Startup: Automatic)           " -ForegroundColor Green
Write-Host " State Dir    : $ProgramDataPath                            " -ForegroundColor Green
Write-Host " Uninstaller  : $InstalledUninstaller                       " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
}
finally {
    Cleanup-TokenEnvironment
    $AuthToken = $null
}
