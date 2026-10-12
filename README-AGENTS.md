# SOC Monitor — Endpoint Agent Installation, Configuration & Operations Guide

This guide provides end-to-end instructions for deploying, configuring, testing, verifying, and troubleshooting SOC Monitor endpoint agents across **Windows 10/11/Server**, **Linux (Debian/Ubuntu/Kali)**, and **WSL (Windows Subsystem for Linux)**.

---

## Agent Architecture Overview

SOC Monitor endpoint agents run as lightweight background services that collect local telemetry, maintain an in-memory & on-disk resilient buffer, and ship events to the central Collector service over HTTP/HTTPS.

```
┌────────────────────────────────────────────────────────┐
│                   ENDPOINT HOST                        │
│                                                        │
│   Windows Event Log          Linux journald / Syslog   │
│  (Security, System, App)     (/var/log/*, cursors)     │
│             │                           │              │
│             ▼                           ▼              │
│      [ Event Collector Engine / win32evtlog ]          │
│                         │                              │
│                         ▼                              │
│      [ Resilient Ring Buffer (Disk / Mem) ]            │
│                         │                              │
│                         ▼                              │
│      [ Transport Engine & Heartbeat Worker ]           │
└─────────────────────────┬──────────────────────────────┘
                          │ HTTP POST /api/v1/agent/events
                          │ X-Agent-Token Authentication
                          ▼
             SOC MONITOR COLLECTOR (:5000)
```

### Supported Platforms & Minimum Requirements

| Platform | Supported OS Versions | Service Implementation | Ingestion Sources |
| :--- | :--- | :--- | :--- |
| **Windows** | Windows 10 (1809+), Windows 11, Windows Server 2019/2022 | Native Windows Service (`SOCMonitorAgent`) | `Application`, `System`, `Security`*, `Sysmon`, `PowerShell`, `Defender` |
| **Linux** | Debian 11+, Ubuntu 20.04+, Kali Linux 2023+ | Native systemd unit (`soc-agent.service`) | `systemd-journald` (cursor tracked), `/var/log/auth.log`, `/var/log/syslog`, `/var/log/audit/audit.log` |
| **WSL** | WSL 2 (Ubuntu, Debian, Kali) | Background daemon or systemd (if enabled) | Linux guest journal & syslog |

*\*Note: Collecting the Windows `Security` channel requires local Administrator privileges (`SeSecurityPrivilege`).*

---

## 1. Network Connectivity & Collector Address

Before enrolling an agent, determine which IP address the endpoint must use to communicate with the Collector:

| Scenario | Collector Listening Host | Endpoint Command Address | Notes |
| :--- | :--- | :--- | :--- |
| **Same Host (Local Windows)** | `127.0.0.1` or `0.0.0.0` | `127.0.0.1:5000` | Agent and collector run on the same Windows physical machine. |
| **LAN / Physical Network** | `0.0.0.0` | `<COLLECTOR_LAN_IP>:5000` | Endpoint reaches collector via local subnet (e.g., `192.168.1.50`). |
| **VirtualBox Guest (e.g. Kali)** | `0.0.0.0` | `192.168.56.1:5000` | Kali VM connects via VirtualBox Host-Only Adapter gateway IP (`192.168.56.1`). |
| **WSL 2** | `0.0.0.0` | Host IP (or mirrored `127.0.0.1` in WSL2) | Default WSL2 requires reaching the Windows vEthernet IP. |

---

## 2. Enrollment Token Lifecycle

1. Open the SOC Monitor dashboard at `http://localhost:3000`.
2. Click **+ Add Endpoint** in the top navigation bar.
3. Select your target operating system tab (**Windows**, **Linux**, or **WSL**).
4. The dashboard calls `/api/v1/agents/enrollment-code` to generate a secure, one-time 24-hour token.
5. **Security Guarantee:** Once the agent successfully registers, the token is marked used and its SHA-256 digest is stored. The token cannot be reused by an attacker.

---

## 3. Windows Agent Deployment

### Option A: Interactive One-Liner (Hidden Token Prompt)
Open an **Elevated PowerShell** (Run as Administrator):

```powershell
$env:AGENTAUTHTOKEN = Read-Host "Paste enrollment token" -AsSecureString; `
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($env:AGENTAUTHTOKEN); `
$plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr); `
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); `
try { `
    Invoke-WebRequest -Uri "http://<COLLECTOR_HOST>:5000/api/v1/agents/download/install-agent.ps1" -OutFile "install-agent.ps1"; `
    .\install-agent.ps1 -CollectorHost "<COLLECTOR_HOST>" -CollectorPort 5000 -Token $plainToken `
} finally { `
    Remove-Item Env:AGENTAUTHTOKEN -ErrorAction SilentlyContinue; `
    $plainToken = $null `
}
```

### Option B: Silent Deployment (Automated / Scripts)
```powershell
$env:AGENTAUTHTOKEN = "<YOUR_ENROLLMENT_TOKEN>"; `
try { `
    Invoke-WebRequest -Uri "http://<COLLECTOR_HOST>:5000/api/v1/agents/download/install-agent.ps1" -OutFile "install-agent.ps1"; `
    .\install-agent.ps1 -CollectorHost "<COLLECTOR_HOST>" -CollectorPort 5000 `
} finally { `
    Remove-Item Env:AGENTAUTHTOKEN -ErrorAction SilentlyContinue `
}
```

### Verifying Windows Agent Status
```powershell
# 1. Check Service Status
Get-Service SOCMonitorAgent

# 2. Inspect Recent Agent Logs
Get-Content -Tail 30 "C:\ProgramData\SOCMonitorAgent\agent.log"
```
*(Expected: `Agent registered successfully` followed by `Heartbeat sent (status: 200)` and `Shipped batch of N events`).*

---

## 4. Linux / Kali Linux Agent Deployment

### Option A: Masked Token One-Liner (Bash / Zsh Compatible)
Open a terminal on your Linux machine (or Kali VM):

```bash
read -rsp "Paste enrollment token: " AGENTAUTHTOKEN && echo && \
curl -fsSL "http://<COLLECTOR_HOST>:5000/api/v1/agents/download/install-agent.sh" -o install-agent.sh && \
chmod +x install-agent.sh && \
sudo AGENTAUTHTOKEN="$AGENTAUTHTOKEN" ./install-agent.sh --host "<COLLECTOR_HOST>" --port 5000; \
unset AGENTAUTHTOKEN
```

### Option B: Manual Step-by-Step Installation
```bash
# 1. Download installer script
curl -fsSL "http://<COLLECTOR_HOST>:5000/api/v1/agents/download/install-agent.sh" -o install-agent.sh
chmod +x install-agent.sh

# 2. Validate script syntax without executing (ensures clean download)
bash -n install-agent.sh

# 3. Execute installer (will prompt interactively for token with hidden input)
sudo ./install-agent.sh --host "<COLLECTOR_HOST>" --port 5000
```

### Verifying Linux Agent Status
```bash
# 1. Check systemd service status
sudo systemctl status soc-agent.service

# 2. Inspect live agent logs
sudo journalctl -u soc-agent.service -n 30 --no-pager
```

---

## 5. WSL (Windows Subsystem for Linux) Deployment

WSL runs as a lightweight virtualization boundary.
- **Important Distinction:** The WSL agent monitors the **WSL Linux environment** (commands run inside bash/zsh, sudo access, Linux auth). It does **not** automatically capture the parent Windows host's Event Logs (install the Windows agent for host telemetry).

### Installation in WSL
```bash
curl -fsSL "http://<COLLECTOR_HOST>:5000/api/v1/agents/download/install-agent.sh" -o install-agent.sh
chmod +x install-agent.sh
sudo ./install-agent.sh --host "<COLLECTOR_HOST>" --port 5000
```
If your WSL distribution does not run systemd, launch the agent manually in the background:
```bash
sudo /opt/soc-monitor-agent/soc-agent --config /etc/soc-monitor-agent/agent.yml &
```

---

## 6. End-to-End Verification with Harmless Test Markers

To verify that the entire telemetry pipeline is operational without waiting for accidental errors:

### Windows Harmless Test Marker
Run in Command Prompt or PowerShell:
```cmd
eventcreate /L APPLICATION /T INFORMATION /SO "SOCMonitor" /ID 100 /D "SOCMON-VERIFY-WINDOWS-20261012: Live telemetry check"
```

### Linux Harmless Test Marker
Run in bash:
```bash
logger "SOCMON-VERIFY-LINUX-20261012: Harmless Linux telemetry verification marker"
```

### Dashboard Verification
1. Open the dashboard at `http://localhost:3000`.
2. Navigate to **Live Events** or **Unified Explorer (`/raw-logs`)**.
3. In the search bar, type `SOCMON-VERIFY`.
4. The event will appear within seconds, proving that the local agent, collector API, taxonomy normalizer, PostgreSQL database, and UI are fully integrated.

---

## 7. Configuration Details & Custom Channels

### Windows Configuration (`C:\ProgramData\SOCMonitorAgent\agent.yml`)
```yaml
collector_url: "http://127.0.0.1:5000"
heartbeat_interval_seconds: 60
batch_size: 50
flush_interval_seconds: 5

enabled_channels:
  - "Application"
  - "System"
  - "Security"
  - "Microsoft-Windows-Sysmon/Operational"
  - "Microsoft-Windows-PowerShell/Operational"
  - "Microsoft-Windows-Windows Defender/Operational"
```

### Linux Configuration (`/etc/soc-monitor-agent/agent.yml`)
```yaml
collector_url: "http://192.168.56.1:5000"
heartbeat_interval_seconds: 60
batch_size: 50
flush_interval_seconds: 5

journald_enabled: true
log_files:
  - "/var/log/auth.log"
  - "/var/log/syslog"
  - "/var/log/kern.log"
  - "/var/log/audit/audit.log"
```

---

## 8. Uninstallation & Clean Removal

Uninstalling an agent preserves historical database records in SOC Monitor while cleaning up the endpoint.

### Windows Uninstallation
Open an Elevated PowerShell:
```powershell
# Standard removal (preserves local machine identity file)
& "C:\ProgramData\SOCMonitorAgent\uninstall-agent.ps1"

# Full cleanup (removes all logs, binaries, and keys)
& "C:\ProgramData\SOCMonitorAgent\uninstall-agent.ps1" -FullCleanup
```

### Linux Uninstallation
Open a Linux terminal:
```bash
# Standard removal (keeps /var/lib identity state)
sudo /opt/soc-monitor-agent/uninstall-agent.sh

# Full cleanup (removes config, binaries, and systemd units)
sudo /opt/soc-monitor-agent/uninstall-agent.sh --full
```

---

## 9. Agent Troubleshooting Runbook

| Symptom | Probable Cause | Verification & Safe Remedy |
| :--- | :--- | :--- |
| **HTTP 401 Unauthorized** | Enrollment token expired (24h) or consumed. | Generate a fresh token in the dashboard (**+ Add Endpoint**). Re-run installer with new token. |
| **VirtualBox Kali cannot reach port 5000** | VM trying to use host Wi-Fi IP or 127.0.0.1. | Point agent to VirtualBox Host-Only Gateway `192.168.56.1:5000`. Run `curl -I http://192.168.56.1:5000/health` from Kali. |
| **Agent status remains OFFLINE** | Service running but heartbeat failing or blocked. | Check service logs: `journalctl -u soc-agent` or `Get-Content agent.log`. Verify heartbeat returns HTTP 200. |
| **Windows Security channel empty** | Installer was run without Administrator privileges. | Re-run `install-agent.ps1` from an elevated PowerShell terminal (`Run as Administrator`). |
| **Journald CPU spin or timeout** | Unbounded catch-up query scanning old logs. | Built-in fix: Bounded queries (`-n 50` on first boot, `-n 200` per batch) prevent timeouts. |
