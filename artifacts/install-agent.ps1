param (
    [Alias("Host", "Collector")]
    [string]$CollectorHost = "127.0.0.1",

    [Alias("Port")]
    [int]$CollectorPort = 5000,

    [Alias("Token", "EnrollmentToken")]
    [string]$AuthToken = "",

    [Alias("Url", "CollectorUrl")]
    [string]$DownloadUrl = "",

    [switch]$Repair = $false
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
if (-not $SourceDir) { $SourceDir = (Get-Location).Path }

# Hardcoded trusted expected SHA-256 for official release package
$ExpectedPackageSha256 = "C212C37E482276871A1F4A1EA51EAB237535CE62C98AB5E8D997A3628C407C66"

# Track temporary files/folders for cleanup in finally block
$script:TempPackageZip = $null
$script:TempExtractDir = $null

# Check if local package already has the executable
$hasLocalExe = (Test-Path (Join-Path $SourceDir "soc-agent-windows.exe")) -or
               (Test-Path (Join-Path $SourceDir "soc-agent-windows\soc-agent-windows.exe")) -or
               (Test-Path (Join-Path $SourceDir "..\dist\soc-agent-windows.exe"))

# If local executable is absent, download from DownloadUrl or default collector endpoint
if (-not $hasLocalExe) {
    if (-not $DownloadUrl) {
        $DownloadUrl = "http://${CollectorHost}:${CollectorPort}/api/v1/agents/download/windows"
    } else {
        # If user passed a base collector URL like http://192.168.56.1:5000, parse host and port
        if ($DownloadUrl -match '^https?://([^:/]+)(?::(\d+))?(.*)$') {
            $parsedHost = $matches[1]
            if ($matches[2]) { $CollectorPort = [int]$matches[2] }
            if ($parsedHost -and $CollectorHost -eq "127.0.0.1") { $CollectorHost = $parsedHost }
            if (-not $matches[3] -or $matches[3] -eq "/") {
                $DownloadUrl = "http://${CollectorHost}:${CollectorPort}/api/v1/agents/download/windows"
            }
        }
    }

    Write-Host "Local binary not found. Downloading agent package from $DownloadUrl..." -ForegroundColor Cyan
    $guidStr = [Guid]::NewGuid().ToString('N')
    $script:TempPackageZip = Join-Path $env:TEMP "soc-agent-windows-$guidStr.zip"
    $script:TempExtractDir = Join-Path $env:TEMP "soc-agent-extract-$guidStr"

    try {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $script:TempPackageZip -UseBasicParsing
    } catch {
        Write-Error "Failed to download agent package from '$DownloadUrl': $_"
        exit 1
    }

    if (-not (Test-Path $script:TempPackageZip)) {
        Write-Error "Downloaded package file '$script:TempPackageZip' not found."
        exit 1
    }

    # Verify SHA-256 checksum of downloaded package before extraction or execution
    Write-Host "Verifying package integrity (SHA-256)..." -ForegroundColor Cyan
    $actualSha256 = (Get-FileHash -Path $script:TempPackageZip -Algorithm SHA256).Hash.ToUpper()
    if ($actualSha256 -ne $ExpectedPackageSha256) {
        Write-Error "Package integrity verification failed! Expected SHA-256: $ExpectedPackageSha256, Actual: $actualSha256. Aborting installation."
        exit 1
    }
    Write-Host "Package integrity verified (SHA-256: $actualSha256)." -ForegroundColor Green

    Write-Host "Extracting agent package..." -ForegroundColor Cyan
    try {
        Expand-Archive -Path $script:TempPackageZip -DestinationPath $script:TempExtractDir -Force
    } catch {
        Write-Error "Failed to extract package archive '$script:TempPackageZip': $_"
        exit 1
    }

    $SourceDir = $script:TempExtractDir
}

# Resolve relative package paths
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

# Copy or deploy uninstaller script to installed directory
$SourceUninstaller = Join-Path $SourceDir "uninstall-agent.ps1"
if (-not (Test-Path $SourceUninstaller)) {
    $SourceUninstaller = Join-Path $SourceDir "Uninstall-SOCAgent.ps1"
}
if (-not (Test-Path $SourceUninstaller)) {
    $SourceUninstaller = Join-Path $PSScriptRoot "uninstall-agent.ps1"
}
if (-not (Test-Path $SourceUninstaller)) {
    $SourceUninstaller = Join-Path $PSScriptRoot "Uninstall-SOCAgent.ps1"
}
if (Test-Path $SourceUninstaller) {
    Copy-Item -Path $SourceUninstaller -Destination $InstalledUninstaller -Force
    Write-Host "Uninstaller stored at $InstalledUninstaller." -ForegroundColor Green
} else {
    # Generate standalone uninstaller directly if missing from extraction tree
    $uninstallerScript = @'
param (
    [switch]$FullCleanup = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$ServiceName = "SOCMonitorAgent"
$ProgramDataPath = Join-Path $env:PROGRAMDATA "SOCMonitorAgent"
$ExecutablePath = Join-Path $ProgramDataPath "soc-agent-windows.exe"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Administrator privileges required. Please run PowerShell as Administrator."
    exit 1
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -eq 'Running') {
        Stop-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
    }
    if (Test-Path $ExecutablePath) {
        & $ExecutablePath remove | Out-Null
    } else {
        & sc.exe delete $ServiceName | Out-Null
    }
    Start-Sleep -Seconds 2
}

if (Test-Path $ExecutablePath) {
    Remove-Item -Path $ExecutablePath -Force -ErrorAction SilentlyContinue
}
$internalDir = Join-Path $ProgramDataPath "_internal"
if (Test-Path $internalDir) {
    Remove-Item -Path $internalDir -Recurse -Force -ErrorAction SilentlyContinue
}

if ($FullCleanup) {
    if (-not $Force) {
        Write-Warning "CAUTION: Full cleanup will permanently delete local agent identity (agent_id.txt), config, and event buffers."
        $confirm = Read-Host "Are you sure you want to perform a FULL cleanup? (yes/NO)"
        if ($confirm -ne "yes") {
            Write-Host "Preserving local state and configuration directory." -ForegroundColor Green
            exit 0
        }
    }
    Remove-Item -Path $ProgramDataPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Full local cleanup completed." -ForegroundColor Green
} else {
    Write-Host "Note: Agent configuration, persistent identity, and state in '$ProgramDataPath' have been PRESERVED." -ForegroundColor Green
    Write-Host "To remove local identity and state files completely, rerun with: .\uninstall-agent.ps1 -FullCleanup" -ForegroundColor Yellow
}
Write-Host "Uninstall complete." -ForegroundColor Green
'@
    [System.IO.File]::WriteAllText($InstalledUninstaller, $uninstallerScript, [System.Text.Encoding]::UTF8)
    Write-Host "Uninstaller generated at $InstalledUninstaller." -ForegroundColor Green
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
try {
    Start-Service -Name $ServiceName -ErrorAction Stop
} catch {
    Write-Warning "Start-Service encountered an error: $_"
}

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

# Verify enrollment registration in service.log if available
Start-Sleep -Seconds 2
$ServiceLogPath = Join-Path $ProgramDataPath "service.log"
$AgentLogPath = Join-Path $ProgramDataPath "agent.log"
$LogPathToCheck = if (Test-Path $ServiceLogPath) { $ServiceLogPath } elseif (Test-Path $AgentLogPath) { $AgentLogPath } else { $null }

if ($LogPathToCheck) {
    $recentLog = Get-Content -Tail 25 -Path $LogPathToCheck -ErrorAction SilentlyContinue | Out-String
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

    # Clean up temporary downloaded archive and extracted files (if created)
    if ($script:TempPackageZip -and (Test-Path $script:TempPackageZip)) {
        Remove-Item -Path $script:TempPackageZip -Force -ErrorAction SilentlyContinue
    }
    if ($script:TempExtractDir -and (Test-Path $script:TempExtractDir)) {
        Remove-Item -Path $script:TempExtractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
