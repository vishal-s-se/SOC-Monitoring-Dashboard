export interface HelpTopic {
  id: string;
  title: string;
  badge?: string;
  summary: string;
  content: string; // Markdown / HTML-formatted content
  commands?: { label: string; cmd: string; platform?: 'windows' | 'linux' | 'general' }[];
  relatedTopicIds?: string[];
}

export interface HelpCategory {
  id: string;
  title: string;
  shortTitle: string;
  icon: string;
  description: string;
  topics: HelpTopic[];
}

export interface TroubleshootingItem {
  id: string;
  symptom: string;
  platform: 'windows' | 'linux' | 'backend' | 'collector' | 'network' | 'general';
  possibleCauses: string[];
  diagnosticSteps: { label: string; command?: string; explanation: string }[];
  safeFix: { title: string; steps: string[]; command?: string };
  verification: string;
  escalation: string;
}

export interface GlossaryItem {
  term: string;
  category: 'core' | 'windows' | 'linux' | 'detection' | 'investigation';
  definition: string;
  practicalExample: string;
  relatedTopicId?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
  category: string;
  relatedTopicId?: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    title: "A. Getting Started with SOC Monitor",
    shortTitle: "Getting Started",
    icon: "Rocket",
    description: "Overview of SOC Monitor, architecture, workflow, core entities, and first-time navigation.",
    topics: [
      {
        id: "overview-mission",
        title: "What is SOC Monitor?",
        summary: "Purpose, core architecture, and operational problems solved.",
        content: `
### What is SOC Monitor?
**SOC Monitor** is a purpose-built Security Operations Center (SOC) monitoring, SIEM, and endpoint telemetry platform designed to bridge heterogeneous Windows and Linux environments.

### Problems It Solves
- **Fragmented Visibility:** In typical hybrid environments, Windows Security Event Logs and Linux systemd journal logs reside in siloed tools. SOC Monitor normalizes both streams into a coherent data model.
- **Accurate Provenance:** Retaining evidence from retired, decommissioned, or replaced endpoints without polluting active fleet health metrics.
- **Actionable Detection:** Real-time correlation with MITRE ATT&CK techniques, behavioral anomaly tracking, and guided analyst investigations.
- **Zero-Guesswork Attribution:** Distinguishing between endpoint primary network interface IPs, event source/destination IPs, and collector ingestion addresses.

### Who Uses SOC Monitor?
1. **Tier 1 / Tier 2 SOC Analysts:** Triage incoming alerts, inspect real-time live events, investigate anomalous logon spikes, and pivot to host/IP context.
2. **Incident Responders:** Construct precise forensic attack timelines, correlate multi-host events, and document investigation findings.
3. **Endpoint & Security Engineers:** Deploy, monitor, and maintain Windows and Linux agent fleet health, verify log ingestion pipelines, and configure retention.
        `,
        relatedTopicIds: ["core-entities", "system-architecture-overview"]
      },
      {
        id: "core-entities",
        title: "Core Concepts: Endpoints, Agents, Events & Alerts",
        summary: "Understanding the distinction between primary entities in the system.",
        content: `
### Conceptual Entity Hierarchy

| Entity | Definition | Example in System |
| :--- | :--- | :--- |
| **Host / Endpoint** | A physical computer or virtual machine operating system instance. | Hostname \`Vishal-S\` (Windows 11) or \`vbox\` (Kali Linux) |
| **Agent** | The software service executing on the host that collects and ships telemetry. | \`agent-5c84d728-...\` running as a Windows Service |
| **Event** | An atomic, timestamped record of an activity observed by an agent. | EventID 4624 (Successful Logon) or SSH Accepted publickey |
| **Raw Log** | The original unparsed or envelope log as shipped before normalization. | Raw JSON payload preserved in \`raw_log\` table |
| **Alert** | A security notification generated when an event matches a detection rule. | *Excessive Failed Logons (Brute Force)* (Severity: HIGH) |
| **Investigation** | An analyst-managed case file aggregating alerts, events, notes, and timelines. | *Investigation #14: Suspicious PowerShell Beaconing on Vishal-S* |

#### Key Distinction: Host vs. Agent
A physical or virtual **Host** may have multiple **Agent** identities over its operational lifetime (for example, if an agent is reinstalled or upgraded). SOC Monitor tracks the **Host** identity while preserving individual **Agent** provenance.
        `,
        relatedTopicIds: ["overview-mission", "detections-alerts-workflow"]
      },
      {
        id: "navigation-workflow",
        title: "First-Time Navigation & Quick-Start Checklist",
        summary: "Step-by-step checklist to verify a functioning endpoint in the dashboard.",
        content: `
### Recommended First-Time Workflow
Follow this 5-step checklist when setting up or validating SOC Monitor:

1. **Verify Services:** Confirm the API, WebSocket, and Collector indicators in the top bar are green (\`ONLINE\` / \`CONNECTED\`).
2. **Inspect Endpoint Management:** Navigate to **Endpoint Management → Agents** (\`/agents\`) to verify enrolled endpoints.
3. **Check Windows or Linux Overviews:** Open **Windows → Overview** (\`/windows\`) or **Linux → Overview** (\`/linux\`) to observe 24-hour ingestion volumes and severity distributions.
4. **Stream Live Events:** Open **Live Events** (\`/live-events\`) to observe incoming real-time telemetry streaming over WebSockets.
5. **Review Security Detections:** Check **Detections & Investigations → Alerts** (\`/alerts\`) to triage open security findings.
        `,
        relatedTopicIds: ["overview-mission", "architecture-dataflow"]
      }
    ]
  },
  {
    id: "system-architecture",
    title: "B. System Architecture & Data Flow",
    shortTitle: "Architecture & Dataflow",
    icon: "Cpu",
    description: "Detailed component responsibilities, ports, inputs, outputs, verification commands, and failure modes.",
    topics: [
      {
        id: "architecture-dataflow",
        title: "End-to-End Pipeline & Component Map",
        summary: "How telemetry flows from endpoint agents through collector to database and dashboard.",
        content: `
### High-Level Architecture Diagram
The diagram below details the components, network port bindings, and communication directions:

\`\`\`
[Windows Endpoint] ──(HTTP POST :5000)──┐
                                          ├──► [Collector Service] ──► [PostgreSQL Database :5432]
[Linux/Kali Endpoint] ──(HTTP POST :5000)─┘      (0.0.0.0:5000)               │
                                                                             │ Queries & Persists
                                                                             ▼
[Browser Dashboard] ◄──(HTTP REST / WS)─────── [FastAPI Backend API] ◄───────┘
(http://localhost:3000)  (Port 8000 & /ws)     (127.0.0.1:8000)
\`\`\`

### Data Flow Stages
1. **Local Collection:** The Windows service queries the Win32 Event Log API; the Linux daemon streams from \`/run/log/journal\`.
2. **Envelope Wrapping:** The agent bundles logs into JSON envelopes with its \`agent_id\`, \`token\`, \`hostname\`, and timestamp.
3. **Ingestion API:** Telemetry is posted to \`http://<COLLECTOR_IP>:5000/api/v1/collector/events\`.
4. **Validation & Normalization:** The collector verifies the agent token, normalizes OS fields, and writes to PostgreSQL.
5. **Detection & WebSocket:** The backend evaluates detection rules and broadcasts events across the \`/ws\` WebSocket connection.
        `,
        relatedTopicIds: ["component-matrix", "collector-diagnostics"]
      },
      {
        id: "component-matrix",
        title: "Component Responsibilities, Inputs & Outputs",
        summary: "Diagnostic matrix for all services operating in the SOC Monitor infrastructure.",
        content: `
### Service Diagnostic Matrix

#### 1. Endpoint Agents
- **Binary/Service:** \`SOCAgent\` (Windows Service) / \`soc-agent.service\` (Linux systemd).
- **Responsibility:** Capture local OS events, buffer in memory during network disconnections, and push batches to the Collector.
- **Port:** Outbound HTTP client to Collector port 5000.
- **Verification:**
  - Windows: \`Get-Service -Name SOCAgent\`
  - Linux: \`systemctl status soc-agent.service\`

#### 2. Collector Service
- **Runtime:** FastAPI / Uvicorn running on Python 3.12.
- **Bind Address:** \`0.0.0.0:5000\` (Accepts connections from host and guest VMs like Kali).
- **Responsibility:** Authenticate enrollment tokens, register agents, update agent heartbeats, normalize events, and persist to database.
- **Verification:** \`Invoke-WebRequest -Uri "http://localhost:5000/health"\` (Returns \`{"status": "ok"}\`).

#### 3. FastAPI Backend
- **Runtime:** FastAPI / Uvicorn running on Python 3.12.
- **Bind Address:** \`127.0.0.1:8000\` (Local backend service).
- **Responsibility:** REST API for authentication, analytics, investigations, MITRE ATT&CK, host telemetry, and real-time WebSocket hub (\`/ws\`).
- **Verification:** \`Invoke-WebRequest -Uri "http://localhost:8000/docs"\` (Returns HTTP 200).

#### 4. PostgreSQL Database
- **Engine:** PostgreSQL 16 on port \`5432\`.
- **Database:** \`soc_monitor\` (Production) / \`soc_monitor_test\` (Automated Test Suite).
- **Tables:** \`agent\`, \`host\`, \`event\`, \`raw_log\`, \`alert\`, \`detection_rule\`, \`investigation\`, \`enrollment_code\`.

#### 5. Next.js Frontend Dashboard
- **Engine:** Next.js 14 App Router on port \`3000\` (\`http://localhost:3000\`).
- **Responsibility:** Unified UI, OS-specific views, interactive charts, and secure session cookie management.
        `,
        commands: [
          { label: "Check Collector Health", cmd: "curl -s http://localhost:5000/health", platform: "general" },
          { label: "Check Windows Agent Service", cmd: "Get-Service -Name SOCAgent | Select-Object Status, StartType", platform: "windows" },
          { label: "Check Linux Agent Service", cmd: "sudo systemctl status soc-agent.service --no-pager", platform: "linux" }
        ],
        relatedTopicIds: ["architecture-dataflow", "troubleshooting-collector"]
      }
    ]
  },
  {
    id: "windows-monitoring",
    title: "C. Windows Monitoring",
    shortTitle: "Windows Monitoring",
    icon: "Monitor",
    description: "Windows Security Event Logs, EventIDs, EventRecordIDs, channels, and forensic investigation.",
    topics: [
      {
        id: "windows-overview-logs",
        title: "Windows Overview & Event Log Explorer",
        summary: "Navigating Windows security metrics and forensic event logs.",
        content: `
### Windows Monitoring Suite
The **Windows** section provides specialized monitoring for Windows 10/11 endpoints:

- **Windows Overview (\`/windows\`):** Displays 24-hour Windows telemetry volume, Event Log ingest metrics, online/offline agent counts, severity breakdown, and recent security events.
- **Windows Live Events (\`/live-events?os=windows\`):** Live stream filtered exclusively for Windows endpoints.
- **Windows Event Logs (\`/windows-logs\`):** Complete forensic event explorer with dedicated columns:
  - **EventID:** Highlighted numeric identifier (e.g. \`4624\`, \`4688\`, \`7045\`).
  - **EventRecordID:** Sequential hardware-independent audit record number for chronological reconstruction.
  - **Channel / Provider:** Originating log stream (\`Security\`, \`System\`, \`Sysmon\`, \`PowerShell\`).
  - **Endpoint:** Reporting Windows machine hostname.
  - **Event Summary:** Formatted account, process, or service description.
        `,
        relatedTopicIds: ["windows-eventids", "windows-scenarios"]
      },
      {
        id: "windows-eventids",
        title: "Essential Windows Security Event IDs",
        summary: "Reference guide for critical Windows EventIDs collected by SOC Monitor.",
        content: `
### Critical Windows Security Event IDs

| Event ID | Channel | Description | Security Significance |
| :--- | :--- | :--- | :--- |
| **4624** | Security | An account was successfully logged on | Logon type 2 (Interactive), 3 (Network), 10 (RDP). |
| **4625** | Security | An account failed to log on | Sub-status code reveals bad password, expired account, or locked account. |
| **4634 / 4647** | Security | An account was logged off | Session duration tracking. |
| **4672** | Security | Special privileges assigned to new logon | Administrative logon (Administrator, SYSTEM). |
| **4688** | Security | A new process has been created | Includes Process Name, PID, and Command Line arguments. |
| **4698** | Security | A scheduled task was created | Persistence mechanism detection. |
| **4720** | Security | A user account was created | Unauthorized user provisioning. |
| **7045** | System | A service was installed in the system | Persistence / Driver installation (Service Name, ImagePath). |
| **1 (Sysmon)** | Sysmon | Process Create with full hashes (SHA256) | Process hierarchy and integrity levels. |
| **3 (Sysmon)** | Sysmon | Network Connection detected | Outbound C2 socket connections. |
        `,
        relatedTopicIds: ["windows-scenarios", "authentication-monitoring"]
      },
      {
        id: "windows-scenarios",
        title: "Realistic Investigation Scenarios",
        summary: "Walkthrough of suspicious logon bursts and process masquerading.",
        content: `
### Example Scenario 1: Local Brute Force Attempt
*Note: This is an illustrative training scenario.*

1. **Observation in Dashboard:** In **Windows Overview**, the *Open Alerts* card flags an alert: *Repeated Authentication Failures*.
2. **Triage:** Navigate to **Windows → Authentication** (\`/authentication?os=windows\`).
3. **Evidence:** Multiple EventID \`4625\` events appear in rapid succession for username \`Administrator\` with sub-status \`0xC000006A\` (Bad Password).
4. **Attribution:** The \`source_ip\` indicates \`192.168.1.45\` while \`hostname\` is \`Vishal-S\`.
5. **Action:** Click the event row to open **Event Details Modal** and click **Add to Investigation**.

### Example Scenario 2: Suspicious Process Creation (Living off the Land)
1. **Observation:** In **Windows → Processes** (\`/processes?os=windows\`), filter for \`powershell.exe\`.
2. **Evidence:** EventID \`4688\` reveals:
   \`powershell.exe -NoP -NonI -W Hidden -Enc JABjAGwAaQBlAG4AdAA...==\`
3. **Analysis:** The command utilizes hidden window parameters and base64 encoded payload.
4. **Action:** Pivot to **MITRE ATT&CK** (\`/mitre\`) to correlate against technique **T1059.001 (Command and Scripting Interpreter: PowerShell)**.
        `,
        relatedTopicIds: ["windows-overview-logs", "investigations-guide"]
      }
    ]
  },
  {
    id: "linux-monitoring",
    title: "D. Linux Monitoring",
    shortTitle: "Linux Monitoring",
    icon: "Terminal",
    description: "Systemd journald telemetry, syslog daemons, PRIORITY levels, UID, and Linux forensics.",
    topics: [
      {
        id: "linux-overview-logs",
        title: "Linux Overview & Journald Architecture",
        summary: "How Linux telemetry is captured from systemd journald and presented.",
        content: `
### Linux Telemetry Ingestion
Unlike Windows, Linux does not utilize monolithic numeric Event IDs. The SOC Monitor Linux Agent reads directly from **systemd journald** (\`/run/log/journal\` and \`/var/log/journal\`), normalizing records into structured events.

- **Linux Overview (\`/linux\`):** Displays 24-hour journald event volume, active Kali/Debian agents, daemon unit distributions, and recent system entries.
- **Linux Logs Explorer (\`/linux-logs\`):** Dedicated table with Linux-specific columns:
  - **Systemd Unit / Process:** Originating daemon or command (\`sshd.service\`, \`sudo\`, \`systemd\`, \`CRON\`).
  - **Source Ingestion:** Ingestion channel (\`linux_journald\`).
  - **PRIORITY / Severity:** Systemd log priority level (0-7 mapped to Critical, High, Medium, Info).
  - **UID / User:** Effective execution user ID (e.g. UID \`0\` for root).
  - **Journal Entry:** Raw log message and context.
        `,
        relatedTopicIds: ["linux-priority-metadata", "linux-scenarios"]
      },
      {
        id: "linux-priority-metadata",
        title: "Systemd Priority Levels & Metadata Normalization",
        summary: "How Linux PRIORITY 0-7 maps to SOC Monitor severity.",
        content: `
### Systemd Priority to SOC Severity Mapping

| Systemd PRIORITY | Syslog Severity | SOC Monitor Severity | Description |
| :--- | :--- | :--- | :--- |
| **0** | Emergency | CRITICAL | System is unusable (kernel panic). |
| **1** | Alert | CRITICAL | Immediate action required. |
| **2** | Critical | CRITICAL | Critical system condition. |
| **3** | Error | HIGH | Non-fatal runtime errors. |
| **4** | Warning | MEDIUM | Warning conditions (e.g. disk threshold). |
| **5** | Notice | LOW | Normal but significant condition. |
| **6** | Informational | INFO | Normal operational messages (sshd accepted). |
| **7** | Debug | INFO | Detailed debugging information. |

### Preserved Linux Fields
- \`_SYSTEMD_UNIT\`: Full unit name (e.g. \`ssh.service\`).
- \`SYSLOG_IDENTIFIER\`: Tag or program name (e.g. \`sudo\`, \`sshd\`).
- \`_COMM\`: Process command name.
- \`_PID\`: Process identifier.
- \`_UID\`: Linux user ID of the calling process.
        `,
        relatedTopicIds: ["linux-overview-logs", "linux-scenarios"]
      },
      {
        id: "linux-scenarios",
        title: "Linux Investigation Scenarios",
        summary: "Investigating SSH brute force and unauthorized privilege escalation.",
        content: `
### Example Scenario 1: Unauthorized Sudo Escalation
*Note: This is an illustrative training scenario.*

1. **Observation:** Open **Linux → Authentication** (\`/authentication?os=linux\`).
2. **Evidence:** Search for \`sudo\`. A log entry appears:
   \`user : command not allowed ; TTY=pts/0 ; PWD=/home/user ; USER=root ; COMMAND=/bin/bash\`
3. **Analysis:** The user attempted to invoke a root shell without sudoers authorization.
4. **Pivot:** Pivot to **User Context** (\`/user-context\`) to inspect all activity associated with \`user\`.

### Example Scenario 2: SSH Password Guessing on Kali Linux
1. **Observation:** In **Linux Logs** (\`/linux-logs\`), multiple entries originate from \`sshd\`:
   \`Failed password for invalid user admin from 192.168.56.101 port 43812 ssh2\`
2. **Analysis:** Multiple failed connection attempts from an external IP against non-existent accounts.
3. **Action:** Open **IP Investigation** (\`/ip-investigation?ip=192.168.56.101\`) to check for cross-endpoint reconnaissance.
        `,
        relatedTopicIds: ["linux-overview-logs", "authentication-monitoring"]
      }
    ]
  },
  {
    id: "endpoint-management",
    title: "E. Endpoint Management & Installation",
    shortTitle: "Endpoint Management",
    icon: "Server",
    description: "Hosts vs agents, enrollment token lifecycle, verified installers for Windows and Linux, and health states.",
    topics: [
      {
        id: "hosts-vs-agents",
        title: "Host vs. Agent Architecture & States",
        summary: "Understanding the distinction between physical hosts and agent sessions.",
        content: `
### Host vs. Agent Separation
- **Host (\`/hosts\`):** Represents the physical or virtual machine operating system container. Identified by hardware characteristics and OS identity.
- **Agent (\`/agents\`):** Represents an installed agent instance with a unique UUID, private token hash, and operational state.

### Agent Status Definitions
- **ONLINE (Green):** Agent has sent a heartbeat or event within the last 5 minutes (300 seconds).
- **OFFLINE (Yellow):** Agent was previously active, but no heartbeat has arrived in > 5 minutes.
- **UNKNOWN (Gray):** Newly enrolled agent that has not yet sent its first operational payload.
- **RETIRED (Locked Gray):** Agent has been intentionally decommissioned by an administrator. Its historical events remain preserved.

#### IP Attribution Rule
- **Primary Interface IP (\`ip_address\`):** The real LAN/host-only network interface IP reported by the agent (e.g. \`192.168.56.101\` or \`10.82.64.44\`).
- **Collector Address:** \`192.168.56.1:5000\` or \`127.0.0.1:5000\`. This is the server bind address, *not* the endpoint IP.
        `,
        relatedTopicIds: ["install-windows", "install-linux", "agent-troubleshooting"]
      },
      {
        id: "install-windows",
        title: "Verified Windows Agent Installation Guide",
        summary: "Step-by-step instructions to install the Windows Agent service.",
        content: `
### Windows Agent Installation
The Windows Agent installs as an automatic Windows Service (\`SOCMonitorAgent\`) located in \`C:\\ProgramData\\SOCMonitorAgent\`.

#### Prerequisites
- Windows 10/11 or Windows Server 2016+ (x64)
- PowerShell 5.1+ running as **Administrator**
- Network access to the Collector at port 5000 (e.g. \`http://192.168.56.1:5000\`)
- Visual C++ 2015-2022 Redistributable (x64)

#### Step-by-Step Procedure

1. **Generate an Enrollment Code:**
   In the dashboard header, click **Add Endpoint**. Select **Windows**, and note your fresh one-time enrollment token.

2. **Execute the Installer Script:**
   Run the interactive one-liner in Administrator PowerShell (prompts securely with hidden input, passing the token via \`$env:AGENTAUTHTOKEN\` and clearing it upon completion):
   \`\`\`powershell
   $env:AGENTAUTHTOKEN = Read-Host "Paste enrollment token"; try { Invoke-WebRequest -Uri "http://COLLECTOR_HOST:5000/api/v1/agents/download/install-agent.ps1" -OutFile "install-agent.ps1"; .\\install-agent.ps1 -CollectorHost "COLLECTOR_HOST" -CollectorPort 5000 } finally { Remove-Item Env:AGENTAUTHTOKEN -ErrorAction SilentlyContinue }
   \`\`\`
   *(Replace \`COLLECTOR_HOST\` with your SOC server IP, e.g. \`192.168.56.1\` for VirtualBox Host-Only)*

3. **Verify Service Status:**
   \`\`\`powershell
   Get-Service SOCMonitorAgent
   \`\`\`
   Expected status: \`Running\`.

4. **Inspect Service Logs:**
   \`\`\`powershell
   Get-Content -Tail 25 "C:\\ProgramData\\SOCMonitorAgent\\agent.log"
   \`\`\`

5. **Confirm Ingestion:**
   Within 30–60 seconds, the agent will appear as **ONLINE** in **Endpoint Management → Agents** (\`/agents\`).
        `,
        commands: [
          { label: "Check Windows Service", cmd: "Get-Service -Name SOCMonitorAgent", platform: "windows" },
          { label: "Check Windows Agent Logs", cmd: "Get-Content -Tail 30 \"C:\\ProgramData\\SOCMonitorAgent\\agent.log\"", platform: "windows" },
          { label: "Restart Windows Service", cmd: "Restart-Service -Name SOCMonitorAgent", platform: "windows" },
          { label: "Dedicated Uninstaller (Preserves Identity)", cmd: "& \"C:\\ProgramData\\SOCMonitorAgent\\uninstall-agent.ps1\"", platform: "windows" }
        ],
        relatedTopicIds: ["hosts-vs-agents", "install-linux", "ts-http-401-registration"]
      },
      {
        id: "install-linux",
        title: "Verified Linux / Kali Agent Installation Guide",
        summary: "Step-by-step instructions to install the Linux systemd agent.",
        content: `
### Linux / Kali VM Agent Installation
The Linux Agent runs as a persistent systemd daemon (\`soc-agent.service\`) executing \`/opt/soc-monitor-agent/soc-agent\` and reading systemd journal logs.

#### Prerequisites
- Debian, Ubuntu, or Kali Linux 2023/2024 (amd64)
- Root or sudo privileges
- Network connectivity to Collector (\`http://COLLECTOR_HOST:5000\`)
- Systemd with \`systemd-journald\` active

#### Step-by-Step Procedure

1. **Verify Shell Syntax Before Execution:**
   Always inspect the downloaded installer syntax using \`bash -n\` before running:
   \`\`\`bash
   curl -fsSL "http://COLLECTOR_HOST:5000/api/v1/agents/download/install-agent.sh" -o install-agent.sh
   bash -n install-agent.sh
   \`\`\`
   If Bash returns exit code 0 without output, the script syntax is verified.

2. **Execute the Installer Script:**
   Make executable and run using sudo, supplying the token via the \`AGENTAUTHTOKEN\` environment variable or interactive hidden prompt:
   \`\`\`bash
   chmod +x install-agent.sh
   sudo AGENTAUTHTOKEN="<YOUR_ENROLLMENT_TOKEN>" ./install-agent.sh --host "COLLECTOR_HOST" --port 5000
   \`\`\`
   *(The script's exit trap automatically wipes \`AGENTAUTHTOKEN\` from process memory on completion)*

3. **Verify Systemd Service:**
   \`\`\`bash
   sudo systemctl status soc-agent.service --no-pager
   \`\`\`
   Expected status: \`active (running)\`.

4. **Verify Telemetry Stream & Registration:**
   View the live agent journal logs to confirm successful registration:
   \`\`\`bash
   sudo journalctl -u soc-agent.service -n 50 --no-pager
   \`\`\`
        `,
        commands: [
          { label: "Check Linux Daemon", cmd: "sudo systemctl status soc-agent.service --no-pager", platform: "linux" },
          { label: "Inspect Agent Journal Logs", cmd: "sudo journalctl -u soc-agent.service -n 50 --no-pager", platform: "linux" },
          { label: "Restart Linux Daemon", cmd: "sudo systemctl restart soc-agent.service", platform: "linux" },
          { label: "Test Local Ingestion Event", cmd: "logger \"SOC Monitor test event from Kali Linux\"", platform: "linux" },
          { label: "Dedicated Uninstaller (Preserves Identity)", cmd: "sudo /opt/soc-monitor-agent/uninstall-agent.sh", platform: "linux" }
        ],
        relatedTopicIds: ["hosts-vs-agents", "install-windows", "ts-shell-syntax-error", "ts-linux-events-missing"]
      }
    ]
  },
  {
    id: "live-events",
    title: "F. Live Events & Event Investigation",
    shortTitle: "Live Events",
    icon: "Activity",
    description: "Streaming telemetry mechanics, event details modal, field interpretation, and filtering.",
    topics: [
      {
        id: "live-stream-websocket",
        title: "Real-Time WebSocket Stream Mechanics",
        summary: "How live events reach the dashboard and how to interpret them.",
        content: `
### WebSocket Streaming Pipeline
When viewing **Live Events** (\`/live-events\`), the frontend establishes a persistent WebSocket connection to \`ws://127.0.0.1:8000/ws\`.

- **Live Updates ON:** Newly ingested events are prepended to the top of the table in real time.
- **Paused:** Freezes the table view so analysts can inspect events without the display moving.
- **OS Filtering:** When visiting with \`?os=windows\` or \`?os=linux\`, incoming WebSocket messages are filtered to display only events matching the active operating system.

### Interpreting Event Fields
- **Time:** UTC ISO8601 timestamp converted to local browser time.
- **Severity Badge:** Visual indicator (\`CRITICAL\` in Red, \`HIGH\` in Orange, \`MEDIUM\` in Yellow, \`INFO\` in Blue).
- **Endpoint:** Hostname of the originating device.
- **Source / Source Type:** Collector parser route (\`windows_eventlog\`, \`linux_journald\`, \`syslog\`).
- **Type / Action:** Extracted operational action (e.g. \`successful logon\`, \`process creation\`).
        `,
        relatedTopicIds: ["event-details-inspection", "raw-vs-attack"]
      },
      {
        id: "event-details-inspection",
        title: "Inspecting Event Details & Adding to Investigations",
        summary: "Using the Event Details Modal to examine raw JSON and correlate findings.",
        content: `
### The Event Details Modal
Clicking any event row opens the **Event Details Modal**:

1. **Formatted Header:** Displays timestamp, severity badge, event category, and host attribution.
2. **Structured Metadata:** Displays extracted fields including EventID, Channel, Record ID, Process Path, PID, User, and IP addresses.
3. **Raw JSON Payload:** Full expandable JSON payload preserving the complete original record.
4. **Pivot to Context:** Direct buttons to investigate the associated Hostname or Source IP.
5. **Add to Investigation:** Prompts the analyst to attach the event to an existing or new Investigation case file.
        `,
        relatedTopicIds: ["live-stream-websocket", "investigations-guide"]
      },
      {
        id: "raw-vs-attack",
        title: "Why Raw Events Are Not Proof of an Attack",
        summary: "Understanding the difference between normal telemetry baselines and malicious indicators.",
        content: `
> [!IMPORTANT]
> **A single raw event is almost never standalone proof of a cyber attack.**

### Common Benign Telemetry Spikes
- **EventID 4625 (Failed Logon):** Often caused by stale cached Windows credentials, mapped network drives, or routine user typos.
- **Process Creation \`cmd.exe\` / \`powershell.exe\`:** Used extensively by software updates, backup agents, and IT management scripts.
- **Linux Sudo Logs:** Routine system administration.

### When Telemetry Becomes Suspicious
Look for **clusters of corroborating evidence**:
1. *Volume & Frequency:* Hundreds of failed logons per minute (Brute Force).
2. *Context Anomalies:* Logons at 03:00 AM from unfamiliar subnets.
3. *Process Trees:* Microsoft Word (\`winword.exe\`) spawning \`cmd.exe\` or \`powershell.exe\`.
4. *Living off the Land:* Usage of \`certutil.exe -urlcache\` or \`vssadmin delete shadows\`.
        `,
        relatedTopicIds: ["authentication-monitoring", "detections-alerts-workflow"]
      }
    ]
  },
  {
    id: "authentication",
    title: "G. Authentication Monitoring",
    shortTitle: "Authentication",
    icon: "Key",
    description: "Monitoring logon success/failure, repeated attempts, sudo escalations, and IP attribution.",
    topics: [
      {
        id: "auth-monitoring-guide",
        title: "Logon Success, Failures & Account Triage",
        summary: "Analyzing authentication events across Windows and Linux endpoints.",
        content: `
### Authentication Telemetry Analysis
The **Authentication** view (\`/authentication\`) consolidates logon events:

#### Windows Logon Types (EventID 4624)
- **Type 2 (Interactive):** User typed credentials at the local physical keyboard.
- **Type 3 (Network):** Connection over the network (e.g. SMB share, PsExec).
- **Type 4 (Batch):** Scheduled task running under user credentials.
- **Type 5 (Service):** Windows Service startup.
- **Type 10 (RemoteInteractive):** Remote Desktop Protocol (RDP) session.

#### Linux Authentication Types
- **SSH Password / Publickey:** Authentication records from \`sshd\`.
- **PAM Session:** Pluggable Authentication Module sessions.
- **Sudo Command Execution:** Privileged command execution logged by \`sudo\`.
        `,
        relatedTopicIds: ["windows-eventids", "linux-priority-metadata"]
      }
    ]
  },
  {
    id: "network-firewall-processes",
    title: "H. Network, Firewall & Process Monitoring",
    shortTitle: "Network, Firewall & Processes",
    icon: "Shield",
    description: "Telemetry scope, field definitions, and explicit collection boundaries.",
    topics: [
      {
        id: "network-monitoring",
        title: "Network Telemetry Scope & Limitations",
        summary: "What network telemetry is collected vs. what is not implemented.",
        content: `
### Network Telemetry (\`/network\`)
- **What is Monitored:** High-level connection records captured by Windows Sysmon EventID 3 and Linux daemon connection traces.
- **Captured Fields:** Source IP, Source Port, Destination IP, Destination Port, Protocol (\`TCP\`, \`UDP\`), Endpoint Hostname.
- **What is NOT Implemented:** Full packet capture (PCAP), Deep Packet Inspection (DPI), or SSL/TLS decryption. SOC Monitor monitors endpoint connection metadata, not raw network interfaces.
        `,
        relatedTopicIds: ["firewall-monitoring", "process-monitoring"]
      },
      {
        id: "firewall-monitoring",
        title: "Firewall Telemetry Scope & Actions",
        summary: "Monitoring Windows Defender Firewall and Linux iptables log records.",
        content: `
### Firewall Telemetry (\`/firewall\`)
- **Windows:** Ingests Windows Defender Firewall with Advanced Security event logs (Drop/Allow actions, port filtering).
- **Linux:** Populates when \`iptables\` or \`nftables\` kernel logging rules output to systemd journald.
- **Filtered Actions:** \`ALLOW\`, \`DENY\`, \`BLOCK\`, \`DROP\`, \`ACCEPT\`.
        `,
        relatedTopicIds: ["network-monitoring", "process-monitoring"]
      },
      {
        id: "process-monitoring",
        title: "Process Execution & Commandline Auditing",
        summary: "Auditing process creation, PID/PPID hierarchy, and commandline strings.",
        content: `
### Process Execution Monitoring (\`/processes\`)
- **Windows:** Captured via EventID \`4688\` (Process Creation with Command Line Auditing enabled) and Sysmon EventID \`1\`.
- **Linux:** Captured from systemd service executions and process accounting.
- **Key Fields:**
  - **Process / Command:** Full executable path or command name.
  - **PID & PPID:** Process ID and Parent Process ID for tree reconstruction.
  - **Parent Process:** Name of the launching application (e.g. \`explorer.exe\`).
  - **User:** Account context under which the process executed.
        `,
        relatedTopicIds: ["windows-scenarios", "linux-scenarios"]
      }
    ]
  },
  {
    id: "event-history",
    title: "I. Windows History & Linux History",
    shortTitle: "Event History & Provenance",
    icon: "Archive",
    description: "Historical telemetry, forensic provenance, active vs. retired agents, and audit retention.",
    topics: [
      {
        id: "history-provenance",
        title: "Forensic Provenance & Active vs. Retired Filtering",
        summary: "Why historical records matter and how agent lifecycle is preserved.",
        content: `
### The Value of Forensic Event History
In enterprise SOC operations, endpoints are routinely upgraded, re-imaged, or decommissioned. If retiring an agent deletes its stored logs, incident response teams lose historical baseline evidence.

### SOC Monitor Provenance Architecture
- **Windows History (\`/windows-history\`) & Linux History (\`/linux-history\`):**
  - Query historical telemetry across **all** agent sessions.
  - **Agent Provenance Selector:** Clearly denotes \`🔒 [RETIRED]\` vs \`● [ACTIVE]\` agents.
  - Selecting a retired agent filters records specifically to that historical session.
- **Data Guarantee:** Calling \`POST /agents/{agent_id}/retire\` updates the agent status to \`RETIRED\`; it **never** executes destructive \`DELETE\` queries against the \`event\` or \`raw_log\` tables.
        `,
        relatedTopicIds: ["unified-explorer", "hosts-vs-agents"]
      }
    ]
  },
  {
    id: "unified-explorer",
    title: "J. Unified Explorer (Cross-OS Search)",
    shortTitle: "Unified Explorer",
    icon: "Search",
    description: "Cross-platform log search, correlation, and multi-field queries in /raw-logs.",
    topics: [
      {
        id: "raw-logs-explorer",
        title: "Cross-Platform Correlation in Unified Explorer",
        summary: "Searching across Windows and Linux raw logs simultaneously.",
        content: `
### Unified Explorer (\`/raw-logs\`)
Located under **Advanced Tools → Unified Explorer**, this interface provides raw and normalized search across the entire estate:

- **Cross-OS Searching:** Search across Windows Security Events and Linux systemd journal records in a single query.
- **Full Payload Inspection:** View both the normalized database record and the original raw envelope message.
- **Search Parameters:**
  - Text search (matches descriptions, usernames, commands, and metadata).
  - Operating system filter (\`windows\` vs \`linux\`).
  - Severity level filter.
  - Date and time pagination.
        `,
        relatedTopicIds: ["history-provenance", "event-details-inspection"]
      }
    ]
  },
  {
    id: "detections-alerts",
    title: "K. Detections & Alerts",
    shortTitle: "Detections & Alerts",
    icon: "Bell",
    description: "Rule evaluation catalog, alert lifecycle, severity ratings, and evidence verification.",
    topics: [
      {
        id: "detections-alerts-workflow",
        title: "Detection Rules & Alert Lifecycle",
        summary: "How rules evaluate telemetry and how analysts manage alert states.",
        content: `
### Detection Catalog & Rule Engine
SOC Monitor ships with an integrated catalog of MITRE-aligned detection rules:
- **Rule Evaluation:** Evaluates event properties (EventID, category, thresholds, process names) against incoming telemetry.
- **Deduplication:** Repeated occurrences of the same alert fingerprint increment the \`occurrence_count\` and update \`last_seen\`.

### Alert Lifecycle
- **OPEN:** Newly generated alert requiring analyst triage.
- **ACKNOWLEDGED:** Analyst has reviewed the alert and commenced investigation.
- **RESOLVED:** Investigation concluded; confirmed remediated or verified benign.

### Alert Severity Definitions
- **CRITICAL:** High confidence of severe active compromise (e.g. ransomware encryption, mimikatz execution).
- **HIGH:** Malicious activity indicator (e.g. brute force breach, encoded PowerShell).
- **MEDIUM:** Suspicious activity or policy deviation (e.g. new admin account created).
- **LOW / INFO:** Auditing event of security interest.
        `,
        relatedTopicIds: ["investigations-guide", "mitre-matrix"]
      }
    ]
  },
  {
    id: "investigations-timeline",
    title: "L. Investigations & Attack Timeline",
    shortTitle: "Investigations & Timeline",
    icon: "Folder",
    description: "Opening case files, correlating multi-source evidence, notes, and timeline visualization.",
    topics: [
      {
        id: "investigations-guide",
        title: "Managing Investigations & Case Files",
        summary: "Creating investigations, adding notes, and tracking case resolution.",
        content: `
### Investigations Workflow (\`/investigations\`)
An **Investigation** is an analyst case file used to organize multi-event security findings:

1. **Creating an Investigation:** Click **New Investigation** on \`/investigations\`. Specify Title, Severity, and Description.
2. **Attaching Evidence:** Use the **Add to Investigation** button inside any Event, Alert, or Raw Log modal.
3. **Analyst Notes:** Document root cause analysis, evidence hashes, and communications in the case timeline.
4. **Lifecycle Statuses:** \`OPEN\` → \`IN_PROGRESS\` → \`CLOSED\`.
        `,
        relatedTopicIds: ["attack-timeline-guide", "investigations-walkthrough"]
      },
      {
        id: "attack-timeline-guide",
        title: "Using the Attack Timeline Visualization",
        summary: "Reconstructing the chronological sequence of adversarial actions.",
        content: `
### Attack Timeline (\`/attack-timeline\`)
The **Attack Timeline** provides an interactive chronological visualization:
- Plots alerts, critical events, and investigation milestones on a continuous horizontal or vertical axis.
- Enables analysts to identify gaps in telemetry (e.g. initial access occurred 4 hours before detection).
- Groups events by affected Hostname and Source IP to visualize lateral movement across the network.
        `,
        relatedTopicIds: ["investigations-guide", "investigations-walkthrough"]
      },
      {
        id: "investigations-walkthrough",
        title: "Fictional Investigation Walkthrough",
        summary: "Step-by-step example of investigating an intrusion scenario.",
        content: `
### Fictional Case Study: External Credential Spray to Execution
*Note: This is an illustrative training walkthrough.*

- **10:14 AM:** Alert fires on \`/alerts\`: *Excessive Failed Logons* on host \`Vishal-S\`.
- **10:16 AM:** Analyst inspects \`/authentication?os=windows\`, identifying 40 failed logons followed by 1 successful logon (EventID 4624) for user \`svc_backup\` from IP \`192.168.1.180\`.
- **10:18 AM:** Analyst opens Investigation #21: *Credential Compromise on svc_backup*.
- **10:20 AM:** Analyst checks \`/processes?os=windows\` and finds \`svc_backup\` executing \`whoami /all\` and \`net user /domain\`. Analyst attaches both events to Investigation #21.
- **10:25 AM:** Host is isolated. Analyst adds concluding remediation notes and marks Investigation #21 as \`CLOSED\`.
        `,
        relatedTopicIds: ["investigations-guide", "attack-timeline-guide"]
      }
    ]
  },
  {
    id: "mitre-attack",
    title: "M. MITRE ATT&CK Matrix",
    shortTitle: "MITRE ATT&CK",
    icon: "Target",
    description: "Understanding tactics, techniques, detection mappings, and matrix coverage.",
    topics: [
      {
        id: "mitre-matrix",
        title: "MITRE ATT&CK Framework Integration",
        summary: "How detections and events map to enterprise ATT&CK techniques.",
        content: `
### MITRE ATT&CK Matrix (\`/mitre\`)
SOC Monitor implements an interactive MITRE ATT&CK navigation matrix:

- **Tactics:** High-level adversary objectives (e.g. *Initial Access*, *Execution*, *Persistence*, *Privilege Escalation*, *Credential Access*, *Lateral Movement*).
- **Techniques:** Specific methods adversaries use to accomplish objectives (e.g. *T1059.001 PowerShell*, *T1110 Brute Force*).
- **Active Mappings:** Techniques with active detections in the catalog are highlighted. Clicking a technique opens the **MitreTechniqueDetailsModal** displaying associated rules and linked event evidence.
        `,
        relatedTopicIds: ["detections-alerts-workflow", "investigations-guide"]
      }
    ]
  },
  {
    id: "system-health",
    title: "N. System Health & Observability",
    shortTitle: "System Health",
    icon: "HeartPulse",
    description: "Health indicators, thresholds, API latency, agent reporting ratio, and service status.",
    topics: [
      {
        id: "health-indicators",
        title: "Understanding System Health Metrics",
        summary: "Interpreting database, API, collector, and agent fleet health indicators.",
        content: `
### System Health Dashboard (\`/system-health\`)
Provides real-time observability into the SOC Monitor infrastructure:

1. **REST API Status:** Verifies whether the FastAPI server on port 8000 is responding within healthy latency (< 200ms).
2. **WebSocket Status:** Verifies whether the real-time event distribution socket is active.
3. **Database Health:** Verifies PostgreSQL connectivity and query execution performance.
4. **Agent Fleet Ratio:** Percentage of enrolled agents reporting a heartbeat within the 5-minute timeout window.
5. **Collector Throughput:** Ingestion rate of incoming Windows and Linux event envelopes.
        `,
        relatedTopicIds: ["architecture-dataflow", "component-matrix"]
      }
    ]
  },
  {
    id: "troubleshooting",
    title: "O. Common Errors & Troubleshooting",
    shortTitle: "Troubleshooting",
    icon: "Wrench",
    description: "Detailed diagnostic runbooks, safe fixes, command line procedures, and a searchable library of 31 operational scenarios.",
    topics: [
      {
        id: "troubleshooting-library",
        title: "Searchable Troubleshooting Library (31 Scenarios)",
        badge: "Interactive Finder",
        summary: "Searchable catalog of 31 real-world operational scenarios, root causes, copyable commands, and verification checks.",
        content: `
### Interactive Troubleshooting Finder
Use the interactive scenario finder below to filter by platform (Windows, Linux, Collector, Backend, Network) or search by keyword (e.g., \`401\`, \`offline\`, \`syntax error\`, \`192.168.56.1\`, \`heartbeat\`, \`journald\`, \`Zsh\`).
        `,
        relatedTopicIds: [
          "ts-http-401-registration",
          "ts-shell-syntax-error",
          "ts-collector-connectivity",
          "ts-service-running-endpoint-offline",
          "ts-linux-events-missing",
          "ts-shell-differences-tokens"
        ]
      },
      {
        id: "ts-http-401-registration",
        title: "Article A: HTTP 401 During Agent Registration (Registration failed)",
        badge: "Authentication Error",
        summary: "Diagnosing HTTP 401 Unauthorized, Registration failed, invalid or expired enrollment token, and token rejections.",
        content: `
### Symptoms
During agent installation or immediate post-install service startup, registration fails with an HTTP 401 error.
- Installer terminates with: \`Error: Enrollment failed: The server rejected the enrollment token as invalid or expired.\`
- Linux journalctl or agent log displays: \`401 Client Error: Unauthorized for url: http://COLLECTOR_HOST:5000/api/v1/collector/register\`
- Windows \`agent.log\` records: \`Registration rejected: 401 Unauthorized\`.
- The endpoint is listed as \`UNKNOWN\` or remains absent in the dashboard.

### Meaning of HTTP 401 Unauthorized
HTTP 401 specifically indicates **authentication failure**. The network path between the agent and collector is completely operational, the collector received the registration request, but the server cryptographically rejected the provided enrollment token.

> [!IMPORTANT]
> **Reachability vs. Authentication:** An HTTP 200 response when checking \`http://COLLECTOR_HOST:5000/docs\` or \`/health\` only proves network routing and open firewall ports. It does **not** prove agent authentication will succeed. Registration requires an active, single-use enrollment token stored in the server database.

### Likely Causes
1. **Expired Token:** Enrollment tokens have a strict 24-hour expiration window.
2. **Already-Used Token:** Enrollment tokens are strictly **single-use**. Once registered, the server marks the code consumed.
3. **Incomplete or Truncated Token:** Copying the token inadvertently missed characters or included surrounding shell quotes or whitespace.
4. **Target OS Mismatch:** Generating an enrollment code with target OS set to Windows and providing it to a Linux agent.
5. **Missing Token Variable:** Running the installer without setting \`AGENTAUTHTOKEN\` or pressing Enter through the prompt without pasting.

### Safe Diagnostic Steps

1. **Inspect Agent Service Status on Linux:**
\`\`\`bash
sudo systemctl status soc-agent.service --no-pager
\`\`\`
*(Check whether the service is actively running or crashing in a restart backoff loop)*

2. **Inspect Detailed Registration Failure in Systemd Journal:**
\`\`\`bash
sudo journalctl -u soc-agent.service -n 50 --no-pager
\`\`\`
Look for lines containing:
\`Invalid or expired enrollment code\`, \`401 Client Error\`, or \`registration rejected\`.

3. **Inspect Registration Status on Windows:**
\`\`\`powershell
Get-Service SOCMonitorAgent
Get-Content -Tail 30 "C:\\ProgramData\\SOCMonitorAgent\\agent.log"
\`\`\`

> [!WARNING]
> A running service (\`active (running)\` on Linux or \`Running\` on Windows) does **not** mean registration succeeded. The agent daemon process starts first, then asynchronously attempts registration with exponential backoff retries.

### Corrective Action: Step-by-Step Recovery

1. **Generate a Fresh Token in the Dashboard:**
   - In the SOC Monitor dashboard header, click **Add Endpoint**.
   - Select the target operating system (**Linux** for Kali/Debian, **Windows** for Windows endpoints).
   - Click the copy button next to the freshly generated enrollment token.

2. **Re-run the Installer with the Fresh Token:**
   - **On Linux / Kali:**
   \`\`\`bash
   sudo AGENTAUTHTOKEN="<PASTE_FRESH_TOKEN_HERE>" ./install-agent.sh --host "COLLECTOR_HOST" --port 5000
   \`\`\`
   - **On Windows:**
   \`\`\`powershell
   $env:AGENTAUTHTOKEN = Read-Host "Paste enrollment token"
   .\\install-agent.ps1 -CollectorHost "COLLECTOR_HOST" -CollectorPort 5000
   Remove-Item Env:AGENTAUTHTOKEN -ErrorAction SilentlyContinue
   \`\`\`

3. **Verify Immediate Registration Success in Journal:**
\`\`\`bash
sudo journalctl -u soc-agent.service -n 20 --no-pager
\`\`\`
Successful output contains:
\`Agent registered successfully. Private identity persisted to state directory.\`

### What to Do If a Fresh Token Still Receives 401
- Verify system clock synchronization (\`timedatectl\` on Linux, \`w32tm /query /status\` on Windows). Time drift greater than 5 minutes will fail token timestamp validation.
- Verify that the collector is connected to the expected PostgreSQL database and not a stale in-memory instance.
- Check collector console logs on port 5000 to observe the rejection reason logged by \`collector/app/routes.py\`.
- Never post, email, screenshot, or share raw enrollment tokens in support tickets or chat channels.
        `,
        commands: [
          { label: "Check Linux Service Status", cmd: "sudo systemctl status soc-agent.service --no-pager", platform: "linux" },
          { label: "Inspect Registration Rejection in Journal", cmd: "sudo journalctl -u soc-agent.service -n 50 --no-pager", platform: "linux" },
          { label: "Check Windows Service Status", cmd: "Get-Service SOCMonitorAgent", platform: "windows" },
          { label: "Check Windows Agent Registration Log", cmd: "Get-Content -Tail 30 \"C:\\ProgramData\\SOCMonitorAgent\\agent.log\"", platform: "windows" }
        ],
        relatedTopicIds: ["troubleshooting-library", "ts-service-running-endpoint-offline", "ts-shell-differences-tokens", "safe-ops-dos-and-donts"]
      },
      {
        id: "ts-shell-syntax-error",
        title: "Article B: Linux Installer Shell Syntax Errors (Installer syntax error)",
        badge: "Script Execution Error",
        summary: "Troubleshooting Linux & Kali Linux installation: installer syntax error near unexpected token, bash -n pre-flight checks, and verified CLI arguments.",
        content: `
### Symptoms
When executing the Linux installer on Kali Linux or Ubuntu:
\`\`\`text
./install-agent.sh: line 204: syntax error near unexpected token '(' while looking for matching ')'
\`\`\`
The script aborts immediately before installing binaries, configuring systemd services, or registering the agent.

### Root Cause Analysis
Shell scripts are interpreted sequentially by Bash. When a string literal contains an unbalanced or incorrectly escaped quotation mark (for example, nested single quotes inside \`tr -d '"'\\''\`), Bash treats all subsequent script lines as part of an unclosed string literal. 

When the parser finally encounters a parenthesis (such as in \`echo "Note: Local identity (/var/lib/soc-monitor-agent/...)"\`), Bash interprets the closing parenthesis as an illegal command delimiter rather than literal text, causing:
\`syntax error near unexpected token '(' while looking for matching ')'\`.

### Safe Syntax-Check Workflow (Pre-Execution Validation)
Never execute downloaded scripts blindly. Validate the syntax first without executing any code:

1. **Download the Script Safely:**
\`\`\`bash
curl -fsSL "http://COLLECTOR_HOST:5000/api/v1/agents/download/install-agent.sh" -o install-agent.sh
\`\`\`

2. **Validate Syntax with \`bash -n\` (No Execution):**
\`\`\`bash
bash -n install-agent.sh
\`\`\`
- If the command returns **exit code 0** with no terminal output, the script syntax is valid and safe to execute.
- If there is a syntax error, Bash will print the exact offending line and terminate without running any commands.

3. **Execute Only After Verification:**
\`\`\`bash
chmod +x install-agent.sh
sudo AGENTAUTHTOKEN="<YOUR_TOKEN>" ./install-agent.sh --host "COLLECTOR_HOST" --port 5000
\`\`\`

### Verified Argument Syntax
The authoritative Linux installer supports both named flags and positional parameters:
- \`--host <IP_OR_HOSTNAME>\` (or \`-h\`): The collector IP address (e.g. \`192.168.56.1\`).
- \`--port <PORT>\` (or \`-p\`): The collector port (defaults to \`5000\`).
- \`--token <TOKEN>\` (or \`-t\`): Enrollment token (or pass via \`AGENTAUTHTOKEN\` environment variable).

### Corrective Action & Verification
- If you encounter a syntax error on a previously downloaded script, re-download the latest authoritative version from the collector endpoint: \`http://COLLECTOR_HOST:5000/api/v1/agents/download/install-agent.sh\`.
- In current releases, all quote stripping is written with safe double-quoted sets: \`tr -d "\"'")\`.
        `,
        commands: [
          { label: "Download Script", cmd: "curl -fsSL \"http://COLLECTOR_HOST:5000/api/v1/agents/download/install-agent.sh\" -o install-agent.sh", platform: "linux" },
          { label: "Validate Bash Syntax (Read-Only)", cmd: "bash -n install-agent.sh", platform: "linux" },
          { label: "Make Executable", cmd: "chmod +x install-agent.sh", platform: "linux" },
          { label: "Execute Verified Installer", cmd: "sudo AGENTAUTHTOKEN=\"<TOKEN>\" ./install-agent.sh --host \"COLLECTOR_HOST\" --port 5000", platform: "linux" }
        ],
        relatedTopicIds: ["troubleshooting-library", "ts-http-401-registration", "ts-shell-differences-tokens", "install-linux"]
      },
      {
        id: "ts-collector-connectivity",
        title: "Article C: Collector Network Connectivity & VirtualBox Routing (Collector unreachable)",
        badge: "Network Routing",
        summary: "Diagnosing Collector unreachable, Kali Linux installation networking, VirtualBox Host-Only vs NAT routing, and port 5000 firewall rules.",
        content: `
### Symptoms
- Agent installation fails with: \`curl: (7) Failed to connect to <HOST>: Connection refused\`
- Installer hangs attempting to download the \`.deb\` package from port 5000.
- Agent service logs report: \`httpx.ConnectError: [Errno 111] Connection refused\` or \`Network is unreachable\`.

### How Endpoints Reach the Collector
Endpoint agents transmit HTTP POST requests and WebSockets to the SOC Collector service on TCP port 5000. For an endpoint to communicate:
1. The collector service must be bound to **\`0.0.0.0\`** (listening on all interfaces), not \`127.0.0.1\` (localhost only).
2. The network adapter used by the endpoint must have an active IP route to the host's listening IP.
3. Windows Firewall must allow inbound TCP port 5000 on the adapter's network profile (Private).

### Lab Architecture: Host-Only vs. NAT (VirtualBox Reference Example)
In a virtualized security testing lab, guest VMs (e.g. Kali Linux) interact with the host operating system:

| Adapter Type | VM IP Range | Reachability to Host | Notes |
| :--- | :--- | :--- | :--- |
| **NAT** | \`10.0.2.15/24\` | VM can access external Internet, but host-to-guest and guest-to-host private port binding requires manual port forwarding. | Default VirtualBox adapter mode. |
| **Host-Only Adapter** | \`192.168.56.0/24\` | Direct, bidirectional private network between Windows host and guest VMs. | **Recommended for SOC lab testing.** |

> [!NOTE]
> **Development Lab Reference Values:**
> - Windows Host-Only Adapter IP: \`192.168.56.1\`
> - Kali VM Host-Only IP: \`192.168.56.102\`
> - Collector Port: \`5000\`
> *(These IP addresses are lab-specific examples; adapt them to your subnet configuration)*

#### Why Host Wi-Fi / LAN IP Fails in Host-Only Labs
If your Kali VM is attached to a VirtualBox Host-Only Adapter (\`192.168.56.x\`), attempting to connect to the host's Wi-Fi IP (e.g., \`192.168.1.50\`) will fail because the VM has no routing gateway between the isolated host-only subnet and your home router. Always use the IP assigned to the host's **VirtualBox Host-Only Ethernet Adapter** (\`192.168.56.1\`).

### Safe Diagnostic Commands

1. **Inspect Network Interfaces on Linux Endpoint:**
\`\`\`bash
ip -br addr
\`\`\`
*(Verify the VM has an interface on the 192.168.56.0/24 subnet, e.g. eth0 or eth1)*

2. **Test Collector Reachability from Endpoint:**
\`\`\`bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://COLLECTOR_HOST:5000/docs
\`\`\`
- **Expected Result:** \`HTTP 200\`
- **Meaning:** HTTP 200 confirms reachability and TCP connectivity to the collector endpoint. It does **not** confirm agent authentication or event ingestion.

3. **Check Collector Listener on Host (PowerShell):**
\`\`\`powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen
\`\`\`
*(Verify LocalAddress is \`0.0.0.0\`. If it is \`127.0.0.1\`, remote VMs cannot connect)*

4. **Test Port Handshake from Kali (Optional):**
\`\`\`bash
nc -zv 192.168.56.1 5000
\`\`\`

### Safe Fix & Governance
- If port 5000 is listening but the VM receives Connection Refused, create a specific Windows Firewall rule for TCP 5000 scoped to the VirtualBox adapter:
\`\`\`powershell
New-NetFirewallRule -DisplayName "SOC Collector Port 5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -Profile Private
\`\`\`
- **Never disable the Windows Firewall completely** or expose port 5000 or port 8000 to public untrusted networks as a troubleshooting workaround.
        `,
        commands: [
          { label: "Inspect VM Network Interfaces", cmd: "ip -br addr", platform: "linux" },
          { label: "Test Collector Reachability", cmd: "curl -sS -o /dev/null -w \"HTTP %{http_code}\\n\" http://192.168.56.1:5000/docs", platform: "linux" },
          { label: "Verify Listening Socket on Host", cmd: "Get-NetTCPConnection -LocalPort 5000 -State Listen", platform: "windows" },
          { label: "Add Scoped Firewall Inbound Rule", cmd: "New-NetFirewallRule -DisplayName \"SOC Collector Port 5000\" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -Profile Private", platform: "windows" }
        ],
        relatedTopicIds: ["troubleshooting-library", "ts-http-401-registration", "ts-service-running-endpoint-offline"]
      },
      {
        id: "ts-service-running-endpoint-offline",
        title: "Article D: Service Running but Agent Offline (Heartbeat missing)",
        badge: "Fleet State Drift",
        summary: "Investigating Agent Offline, Heartbeat missing, four-stage lifecycle verification, and ordered 7-point recovery checklist.",
        content: `
### Symptoms
- The system administrator verifies \`soc-agent.service\` is \`active (running)\` on Linux or \`SOCMonitorAgent\` is \`Running\` on Windows.
- However, in the SOC Monitor dashboard under **Endpoint Management → Agents** (\`/agents\`), the agent remains in **OFFLINE** (Yellow) or **UNKNOWN** (Gray) status with Heartbeat missing.

### The Four Distinct Lifecycle Stages
An agent transitioning to a healthy, active state must successfully pass through four separate stages:

\`\`\`text
Stage 1: OS Service Starts
  └─> Systemd / Windows SCM launches executable

Stage 2: Agent Registers
  └─> Enrolls with one-time token -> receives private agent UUID & auth secret

Stage 3: Heartbeat Loop Operates
  └─> Transmits periodic check-ins every 30-60s -> updates 'last_seen' in DB

Stage 4: Telemetry Ingests
  └─> Security events parsed -> normalized -> written to event store -> broadcast via WebSocket
\`\`\`

> [!IMPORTANT]
> **Critical Rule:** Service status alone only proves **Stage 1**. An active process will remain \`active (running)\` even if Stage 2 failed with HTTP 401, Stage 3 cannot reach the database, or Stage 4 has zero events.

### Ordered 7-Step Troubleshooting Checklist

1. **Check Service Status:**
   - Linux: \`sudo systemctl status soc-agent.service --no-pager\`
   - Windows: \`Get-Service SOCMonitorAgent\`

2. **Inspect Recent Service Logs for Hidden Failures:**
   - Linux: \`sudo journalctl -u soc-agent.service -n 50 --no-pager\`
   - Windows: \`Get-Content -Tail 50 "C:\\ProgramData\\SOCMonitorAgent\\agent.log"\`
   - Look for registration rejections, token renewal errors, or heartbeat timeouts.

3. **Confirm the Configured Collector Address:**
   - Inspect \`/etc/soc-monitor-agent/agent.yml\` on Linux or \`C:\\ProgramData\\SOCMonitorAgent\\agent.yml\` on Windows.
   - Verify the \`host:\` and \`port:\` parameters match the actual server address, not \`127.0.0.1\` or an unverified interface.

4. **Verify Heartbeat Transmission:**
   - Agents send heartbeats every 60 seconds by default.
   - Look for \`Heartbeat sent: 200 OK\` in agent logs.
   - If heartbeats fail with 401/403, the private agent token stored in \`/var/lib/soc-monitor-agent/state\` may be out of sync.

5. **Verify Hostname and Agent Identity:**
   - Check the hostname reported in logs. If multiple endpoints share identical cloned hostnames or identical MAC addresses, heartbeats may collide.

6. **Inspect Endpoint Last-Seen Time in Dashboard:**
   - Navigate to \`/agents\`. Inspect the **Last Seen** column.
   - SOC Monitor marks an agent **OFFLINE** if \`last_seen\` is older than **5 minutes** (300 seconds).

7. **Verify Collector-to-Backend Database Path:**
   - If the agent reports \`Heartbeat sent: 200 OK\` but the dashboard still shows OFFLINE:
     - Verify the Collector (port 5000) and Backend (port 8000) are pointing to the exact same PostgreSQL database.
     - Verify WebSocket connection status in the dashboard top navigation bar is green (\`CONNECTED\`).
        `,
        commands: [
          { label: "Inspect Linux Service Logs", cmd: "sudo journalctl -u soc-agent.service -n 50 --no-pager", platform: "linux" },
          { label: "Inspect Linux Config File", cmd: "sudo cat /etc/soc-monitor-agent/agent.yml", platform: "linux" },
          { label: "Inspect Windows Service Logs", cmd: "Get-Content -Tail 50 \"C:\\ProgramData\\SOCMonitorAgent\\agent.log\"", platform: "windows" },
          { label: "Inspect Windows Config File", cmd: "Get-Content \"C:\\ProgramData\\SOCMonitorAgent\\agent.yml\"", platform: "windows" }
        ],
        relatedTopicIds: ["troubleshooting-library", "ts-http-401-registration", "ts-linux-events-missing", "hosts-vs-agents"]
      },
      {
        id: "ts-linux-events-missing",
        title: "Article E: Linux Events Missing from Dashboard (Events not appearing)",
        badge: "Ingestion Diagnostics",
        summary: "Diagnosing Events not appearing, systemd-journal group permissions, logger test events, and live ingestion pipeline.",
        content: `
### Symptoms
- The Linux agent is **ONLINE** (green indicator in \`/agents\`), and heartbeats are arriving every 60 seconds.
- However, navigating to **Linux → Live Events** (\`/live-events?os=linux\`) or **Linux Logs** (\`/linux-logs\`) shows Events not appearing (empty table or zero new records).

### Root Cause Analysis
Successful agent registration and heartbeat check-ins only prove the management channel is healthy. Telemetry ingestion is a separate data pipeline. Events may be missing because:
1. **No New Security Activity:** Linux systems generate very few security events when idle.
2. **Journald Permissions:** The service user (\`soc-agent\`) lacks permission to read binary systemd journal files in \`/var/log/journal\`.
3. **Log Mode Disabled:** \`journald_enabled\` is set to \`false\` in \`/etc/soc-monitor-agent/agent.yml\`.
4. **Active UI Filter:** An active search filter or date range on the dashboard excludes the incoming events.

### Diagnostic & Verification Procedure

1. **Verify Journald Group Membership:**
\`\`\`bash
id -Gn soc-agent 2>/dev/null || id -Gn
\`\`\`
The agent process user must belong to \`systemd-journal\` or \`adm\` to read system logs without root privileges.
\`\`\`bash
sudo usermod -aG systemd-journal,adm soc-agent
\`\`\`

2. **Verify Agent Configuration:**
\`\`\`bash
sudo grep -E "journald_enabled|log_paths" /etc/soc-monitor-agent/agent.yml
\`\`\`
Ensure \`journald_enabled: true\` on systemd-based Linux systems.

3. **Generate a Harmless Local Test Event:**
Generate a synthetic test message directly into the system log using the standard Linux \`logger\` utility:
\`\`\`bash
logger "SOC Monitor test event from Kali Linux"
\`\`\`

4. **Locate the Test Event in Dashboard:**
   - Open **Linux → Live Events** (\`/live-events?os=linux\`).
   - If the WebSocket is connected, the new event should stream in within 5–10 seconds.
   - Alternatively, open **Linux → Logs** (\`/linux-logs\`) and search for \`SOC Monitor test event\`.

5. **If the Test Event Does Not Appear:**
   - Verify that the local system log captured the message:
     \`\`\`bash
     sudo journalctl -n 10 --no-pager | grep "SOC Monitor test event"
     \`\`\`
   - Check agent logs for batch submission errors:
     \`\`\`bash
     sudo journalctl -u soc-agent.service -n 30 --no-pager | grep -iE "event|batch|error"
     \`\`\`
   - Verify the Collector is accepting events on \`/api/v1/collector/events\`.
        `,
        commands: [
          { label: "Generate Harmless Test Log", cmd: "logger \"SOC Monitor test event from Kali Linux\"", platform: "linux" },
          { label: "Verify Test Message in Local Journal", cmd: "sudo journalctl -n 10 --no-pager | grep \"SOC Monitor test event\"", platform: "linux" },
          { label: "Check Group Permissions", cmd: "id -Gn soc-agent", platform: "linux" },
          { label: "Inspect Event Ingestion Logs", cmd: "sudo journalctl -u soc-agent.service -n 40 --no-pager | grep -iE \"batch|event\"", platform: "linux" }
        ],
        relatedTopicIds: ["troubleshooting-library", "ts-service-running-endpoint-offline", "linux-overview-logs"]
      },
      {
        id: "ts-shell-differences-tokens",
        title: "Article F: Shell Differences and Safe Token Input (Zsh versus Bash)",
        badge: "Security & Governance",
        summary: "Resolving Zsh versus Bash interactive shell errors, read -p coprocess incompatibilities, Enrollment token security, and avoiding history leaks.",
        content: `
### Symptoms & Shell Incompatibilities
When pasting installation one-liners into modern interactive shells (such as default Kali Linux **Zsh** or custom user shells):
\`\`\`text
read: -p: no coprocess
\`\`\`
or the terminal displays syntax errors regarding options like \`-rsp\`.

### Shell Implementation Disparities: Bash vs. Zsh
- In **Bash**, \`read -p "Prompt: " VAR\` prints a prompt string and stores input in \`$VAR\`. Adding \`-s\` conceals typed characters.
- In **Zsh**, \`read -p\` interprets \`-p\` as reading from an external *coprocess*. To specify a prompt in Zsh, the syntax is \`read "VAR?Prompt: "\` or \`read -s "VAR?Prompt: "\`.

### Safe Interactive Token Input Strategy
To avoid shell-specific \`read\` errors while preventing sensitive tokens from being written to plain-text shell history files (\`~/.bash_history\`, \`~/.zsh_history\`):

#### Method 1: Prefix Command with Space (History Bypass)
In most Linux shells with \`HISTCONTROL=ignorespace\` enabled, prefixing a command with a leading space excludes it from history:
\`\`\`bash
 sudo AGENTAUTHTOKEN="<PASTE_TOKEN>" ./install-agent.sh --host "COLLECTOR_HOST" --port 5000
\`\`\`

#### Method 2: Let the Installer Prompt Interactively
Run the installer directly without the environment variable:
\`\`\`bash
sudo ./install-agent.sh --host "COLLECTOR_HOST" --port 5000
\`\`\`
The installer script itself executes strictly in **Bash** (\`#!/usr/bin/env bash\`), ensuring that internal \`read -rsp\` prompts execute with standard Bash semantics regardless of your parent shell. The prompt conceals input, prevents terminal echoing, and keeps the token completely out of shell history.

### Process Environment Hygiene & Traps
In \`artifacts/install-agent.sh\`, a safety exit trap automatically wipes tokens upon script completion or termination:
\`\`\`bash
cleanup() {
    unset AGENTAUTHTOKEN 2>/dev/null || true
    unset AUTH_TOKEN 2>/dev/null || true
}
trap cleanup EXIT INT TERM
\`\`\`
Similarly, in Windows PowerShell:
\`\`\`powershell
$env:AGENTAUTHTOKEN = Read-Host "Paste enrollment token"
try {
    .\\install-agent.ps1 -CollectorHost "192.168.56.1" -CollectorPort 5000
} finally {
    Remove-Item Env:AGENTAUTHTOKEN -ErrorAction SilentlyContinue
}
\`\`\`

> [!CAUTION]
> **Secret Governance:** Environment variables are not a substitute for enterprise secret management. Privileged users can inspect process environments via \`/proc/<pid>/environ\`. Never paste tokens into public bug reports, GitHub issues, Discord/Slack channels, or screenshots.
        `,
        commands: [
          { label: "Interactive Hidden Prompt Install (Universal)", cmd: "sudo ./install-agent.sh --host \"COLLECTOR_HOST\" --port 5000", platform: "linux" },
          { label: "Clear Token from Shell Environment", cmd: "unset AGENTAUTHTOKEN AUTH_TOKEN", platform: "linux" },
          { label: "Clear Token from PowerShell Environment", cmd: "Remove-Item Env:AGENTAUTHTOKEN -ErrorAction SilentlyContinue", platform: "windows" }
        ],
        relatedTopicIds: ["troubleshooting-library", "ts-http-401-registration", "safe-ops-dos-and-donts", "safe-ops-guidelines"]
      }
    ]
  },
  {
    id: "security-operations",
    title: "P. Security & Safe Operations",
    shortTitle: "Security & Safety",
    icon: "Lock",
    description: "Enrollment token security, user-facing Do's and Don'ts, least privilege, safe diagnostics, and sensitive log handling.",
    topics: [
      {
        id: "safe-ops-dos-and-donts",
        title: "User-Facing Do's and Don'ts Guide",
        badge: "Operational Checklist",
        summary: "Essential rules for operational security, agent lifecycle management, and reliable incident diagnostics.",
        content: `
### Operational Best Practices & Safety Standards

Adhere to this definitive Do's and Don'ts checklist when installing, maintaining, and troubleshooting SOC Monitor agents and telemetry pipelines:

---

### What You Should Do (DO)

- **Do Verify Reachability First:** Test network connectivity to the Collector IP and port (\`http://COLLECTOR_HOST:5000/docs\`) from the endpoint before starting installation.
- **Do Validate Script Syntax:** Run \`bash -n install-agent.sh\` on downloaded shell scripts to verify syntax integrity before execution.
- **Do Use Fresh Enrollment Tokens:** Generate a new token in the **Add Endpoint** modal whenever a token has expired, been consumed, or rejected with HTTP 401.
- **Do Inspect Service Logs Directly:** Use \`journalctl -u soc-agent.service\` (Linux) or \`Get-Content agent.log\` (Windows) after installation to verify genuine registration success.
- **Do Respect the Heartbeat Interval:** Wait at least 60 seconds (the default heartbeat cycle) before deciding whether an endpoint is updating its last-seen state.
- **Do Evaluate Lifecycle Stages Separately:** Confirm service startup, agent registration, heartbeat health, and telemetry ingestion as separate stages.
- **Do Redact Secrets in Diagnostic Exports:** Remove or mask tokens, database URLs, passwords, and private identifiers before sharing logs.
- **Do Use the Official Uninstaller:** Run \`uninstall-agent.sh\` or \`uninstall-agent.ps1\` to cleanly stop services and preserve or remove local identities.
- **Do Preserve State During Initial Diagnosis:** Keep existing configuration files and agent identities intact while investigating network or token issues.

---

### What You Should Avoid (DON'T)

- **Don't Reuse Enrollment Tokens:** Never attempt to enroll multiple agents or retry failed installations with an already-consumed token.
- **Don't Assume Service Status Proves Health:** Never assume an active service status means the endpoint is registered or sending logs.
- **Don't Repeatedly Reinstall Without Reading Logs:** Avoid uninstalling and reinstalling in a loop without diagnosing the exact error in service logs.
- **Don't Delete Database Records or State Prematurely:** Do not wipe \`/var/lib/soc-monitor-agent\` or drop database tables as an initial troubleshooting step.
- **Don't Point Agents to Unverified Addresses:** Do not change collector addresses to arbitrary IPs without verifying route reachability.
- **Don't Disable System Firewalls:** Never disable the host firewall or expose private backend ports (\`8000\`, \`5432\`) publicly to work around network issues.
- **Don't Leak Tokens in Public Channels:** Never post enrollment codes, JWT keys, or database credentials in tickets, chat rooms, or screenshots.
- **Don't Execute Destructive Internet Snippets:** Never run unverified shell commands found on web forums that use forced cleanup flags or raw file overrides.
- **Don't Assume Global Event Counts Prove Endpoint Health:** Never assume non-zero dashboard event totals mean a specific newly enrolled endpoint is sending events.
        `,
        relatedTopicIds: ["safe-ops-guidelines", "troubleshooting-library", "ts-http-401-registration"]
      },
      {
        id: "safe-ops-guidelines",
        title: "Safe Operations & Token Governance",
        summary: "Best practices for token protection, least privilege, and log confidentiality.",
        content: `
### Security Best Practices

1. **Enrollment Token Confidentiality:**
   - Enrollment tokens (\`enrollment_code\`) grant authority to register an endpoint agent.
   - Never share tokens over unsecured chat or commit them to source control.
   - Use one-time codes whenever possible; expired or used tokens are automatically rejected.

2. **Least Privilege Agent Execution:**
   - The Windows Agent service runs under \`LocalSystem\` to access the security audit event log; protect its binary and configuration directory (\`C:\\ProgramData\\SOCMonitorAgent\`) with strict ACLs.
   - The Linux Agent only requires read access to systemd journal files (\`adm\` / \`systemd-journal\` group).

3. **Safe Diagnostic Policies:**
   - Never execute destructive database queries (\`DROP\`, \`DELETE\`, \`TRUNCATE\`) during troubleshooting.
   - Always run safe, read-only diagnostic commands first.
   - Mask credentials, tokens, and PII when exporting logs for technical review.
        `,
        relatedTopicIds: ["safe-ops-dos-and-donts", "hosts-vs-agents", "troubleshooting-library"]
      }
    ]
  },
  {
    id: "faq-glossary",
    title: "Q. FAQ & Glossary",
    shortTitle: "FAQ & Glossary",
    icon: "BookOpen",
    description: "Searchable Frequently Asked Questions and an alphabetized glossary of 30+ SOC terms.",
    topics: [
      {
        id: "faq-section",
        title: "Frequently Asked Questions",
        summary: "Answers to common administrative and operational questions.",
        content: `
### Frequently Asked Questions
Review the searchable FAQ tab below for answers regarding deployment, performance, data retention, and troubleshooting.
        `,
        relatedTopicIds: ["glossary-section", "overview-mission"]
      },
      {
        id: "glossary-section",
        title: "SOC Monitor & Cybersecurity Glossary",
        summary: "Alphabetized reference of 30+ SOC, Windows, and Linux monitoring terms.",
        content: `
### Alphabetized Glossary
Explore definitions, practical examples, and cross-references for essential SOC terminology.
        `,
        relatedTopicIds: ["faq-section", "overview-mission"]
      }
    ]
  }
];

export const TROUBLESHOOTING_LIBRARY: TroubleshootingItem[] = [
  {
    id: "ts-1",
    symptom: "Agent displays OFFLINE in the dashboard",
    platform: "general",
    possibleCauses: [
      "Agent service is stopped or failed to start",
      "Network connection between endpoint and collector (port 5000) is interrupted",
      "Heartbeat interval has exceeded the 5-minute threshold",
      "Agent crashed or encountered an unhandled exception"
    ],
    diagnosticSteps: [
      { label: "Windows Service Check", command: "Get-Service -Name SOCAgent", explanation: "Verify whether the service is running on the Windows host." },
      { label: "Linux Daemon Check", command: "sudo systemctl status soc-agent.service", explanation: "Verify if the systemd daemon is active and running." },
      { label: "Network Connectivity", command: "curl -s http://<COLLECTOR_IP>:5000/health", explanation: "Confirm that the endpoint can reach the collector health endpoint." }
    ],
    safeFix: {
      title: "Restart Agent Service & Verify Collector Access",
      steps: [
        "Confirm the collector is reachable by curling its health endpoint.",
        "Restart the service on the affected endpoint.",
        "Inspect the agent log file for connection refusal messages."
      ],
      command: "Restart-Service -Name SOCAgent  # (Windows) or sudo systemctl restart soc-agent.service (Linux)"
    },
    verification: "Within 60 seconds, the agent status in /agents should transition from OFFLINE to ONLINE (Green).",
    escalation: "If the service is running but the agent remains offline, check collector logs on the host to inspect rejected heartbeat tokens."
  },
  {
    id: "ts-2",
    symptom: "Agent service fails to start on Windows",
    platform: "windows",
    possibleCauses: [
      "Invalid or unquoted paths in config.yaml",
      "Missing write permissions on C:\\Program Files\\SOCAgent",
      "Corrupted binary or missing Visual C++ Redistributable runtime"
    ],
    diagnosticSteps: [
      { label: "Inspect Windows Application Event Log", command: "Get-EventLog -LogName Application -Source SOCAgent -Newest 5", explanation: "Inspect the fatal service initialization error." },
      { label: "Check Config Syntax", command: "Get-Content 'C:\\Program Files\\SOCAgent\\config.yaml'", explanation: "Verify that the YAML structure is valid." }
    ],
    safeFix: {
      title: "Validate config.yaml & Service Configuration",
      steps: [
        "Open config.yaml in Notepad.",
        "Ensure paths use forward slashes (/) or double backslashes (\\\\).",
        "Verify collector URL is formatted with http:// and port 5000."
      ]
    },
    verification: "Run Start-Service -Name SOCAgent and verify status is Running.",
    escalation: "If service exits with code 1053, run the binary directly in an Administrator PowerShell console to observe the console crash trace."
  },
  {
    id: "ts-3",
    symptom: "Agent cannot reach the Collector (Connection Refused)",
    platform: "network",
    possibleCauses: [
      "Collector service is not running on port 5000",
      "Host firewall is blocking inbound port 5000",
      "VirtualBox host-only adapter is misconfigured or has the wrong IP address"
    ],
    diagnosticSteps: [
      { label: "Check Port 5000 on Host", command: "netstat -ano | findstr :5000", explanation: "Confirm collector is listening on 0.0.0.0:5000." },
      { label: "Test Port from VM", command: "nc -zv 192.168.56.1 5000", explanation: "Test TCP handshake from the guest Kali VM." }
    ],
    safeFix: {
      title: "Start Collector & Adjust Firewall",
      steps: [
        "Ensure collector is running with host set to 0.0.0.0, not 127.0.0.1.",
        "Allow port 5000 inbound on Windows Firewall for the VirtualBox host-only adapter network."
      ],
      command: "New-NetFirewallRule -DisplayName 'SOC Collector 5000' -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow"
    },
    verification: "Curling http://192.168.56.1:5000/health from the VM returns {\"status\": \"ok\"}.",
    escalation: "Verify VirtualBox host-only network adapter IP is 192.168.56.1/24 in ipconfig."
  },
  {
    id: "ts-4",
    symptom: "Registration fails: Token is invalid, expired, or already used",
    platform: "backend",
    possibleCauses: [
      "The enrollment token was already used by another endpoint",
      "Token expired past its validity window",
      "Target OS mismatch (generated Windows token used on Linux)"
    ],
    diagnosticSteps: [
      { label: "Check Enrollment Code Table", command: "Query /api/v1/agents/enrollment-code via dashboard", explanation: "Inspect token status in dashboard Add Endpoint modal." }
    ],
    safeFix: {
      title: "Generate a Fresh Enrollment Token",
      steps: [
        "In the dashboard header, click '+ Add Endpoint'.",
        "Select the appropriate operating system (Windows or Linux).",
        "Generate a fresh code and supply it to the installation script."
      ]
    },
    verification: "Registration API returns HTTP 200 with an assigned agent UUID.",
    escalation: "If fresh tokens fail, inspect backend audit logs for token validation exceptions."
  },
  {
    id: "ts-5",
    symptom: "Agent repeatedly retries registration in a loop",
    platform: "collector",
    possibleCauses: [
      "Agent state file (token/ID) could not be written to disk",
      "Collector registered the agent but network dropped before agent received response",
      "Permission denied on state directory"
    ],
    diagnosticSteps: [
      { label: "Inspect Linux State File", command: "ls -la /var/lib/soc-agent/", explanation: "Check permissions of Linux state storage directory." },
      { label: "Inspect Windows State File", command: "Get-ChildItem 'C:\\ProgramData\\SOCAgent\\'", explanation: "Verify Windows state file exists." }
    ],
    safeFix: {
      title: "Grant Write Permissions to State Directory",
      steps: [
        "Ensure the service user has write permissions on the state directory.",
        "For Linux: sudo chown -R soc-agent:soc-agent /var/lib/soc-agent/"
      ]
    },
    verification: "Agent writes agent_id.txt and begins sending heartbeats instead of register requests.",
    escalation: "Inspect agent log for errno 13 (Permission denied)."
  },
  {
    id: "ts-6",
    symptom: "Logs are not appearing in the dashboard",
    platform: "general",
    possibleCauses: [
      "Agent is registered but event collection channel is empty",
      "Database connection pool exhausted",
      "Time drift between endpoint and server causing events to appear in the past"
    ],
    diagnosticSteps: [
      { label: "Check Endpoint Clock", command: "Get-Date  # (Windows) or date -u (Linux)", explanation: "Compare endpoint time with server UTC time." },
      { label: "Check Database Event Count", command: "Check /analytics/overview API total_events", explanation: "Verify if event count in DB is increasing." }
    ],
    safeFix: {
      title: "Synchronize System Clocks & Verify Ingestion",
      steps: [
        "Ensure both host and VM are synchronized with NTP.",
        "Check /windows-logs or /linux-logs with 'All' time range to see if events are indexed under a different timestamp."
      ]
    },
    verification: "New events appear within 15 seconds in Live Events.",
    escalation: "Inspect collector terminal output for database insertion rollbacks."
  },
  {
    id: "ts-7",
    symptom: "Logs appear in storage (/raw-logs) but not in Live Events",
    platform: "backend",
    possibleCauses: [
      "WebSocket connection is disconnected or errored",
      "Active OS filter on Live Events does not match incoming event operating_system field",
      "Browser tab was backgrounded and paused WebSocket stream"
    ],
    diagnosticSteps: [
      { label: "Check Real-Time Badge in Header", explanation: "Verify TopBar Real-Time indicator shows green 'CONNECTED'." },
      { label: "Inspect Browser Console", explanation: "Open F12 Console and check for WebSocket close code 1006." }
    ],
    safeFix: {
      title: "Verify WebSocket Status & Clear Filter",
      steps: [
        "Click the 'Live Updates' toggle in /live-events to ensure stream is not paused.",
        "Remove any '?os=' query parameter to inspect the unfiltered global stream."
      ]
    },
    verification: "TopBar Real-Time status indicates CONNECTED and incoming events increment live table.",
    escalation: "Restart backend server to reset the WebSocket broadcasting manager."
  },
  {
    id: "ts-8",
    symptom: "Windows events are missing (Table empty)",
    platform: "windows",
    possibleCauses: [
      "Windows Event Log channel name in config is incorrect",
      "Audit logging policy is not enabled in Local Security Policy",
      "SOCAgent service account lacks SeSecurityPrivilege"
    ],
    diagnosticSteps: [
      { label: "Check Audit Policy", command: "auditpol /get /category:*", explanation: "Verify Logon/Logoff and Process Creation auditing are enabled." },
      { label: "Read Windows Event Channel", command: "Get-WinEvent -LogName Security -MaxEvents 5", explanation: "Verify events exist in local Windows log." }
    ],
    safeFix: {
      title: "Enable Windows Security Auditing Policies",
      steps: [
        "Run secpol.msc → Advanced Audit Policy Configuration.",
        "Enable Success & Failure for: Logon/Logoff, Detailed Tracking (Process Creation)."
      ],
      command: "auditpol /set /subcategory:\"Logon\" /success:enable /failure:enable"
    },
    verification: "Perform a lock/unlock; EventID 4624 should appear in /windows-logs.",
    escalation: "Confirm Windows Event Log service (EventLog) is running."
  },
  {
    id: "ts-9",
    symptom: "Linux journald or authentication logs are missing",
    platform: "linux",
    possibleCauses: [
      "Systemd journal storage is volatile (/run/log/journal only)",
      "soc-agent user not in systemd-journal group",
      "No authentication events have occurred on the Linux machine"
    ],
    diagnosticSteps: [
      { label: "Check Group Membership", command: "id -Gn soc-agent", explanation: "Verify soc-agent belongs to systemd-journal or adm." },
      { label: "Generate Test Auth Event", command: "su - non_existent_user", explanation: "Trigger an intentional authentication failure." }
    ],
    safeFix: {
      title: "Add Agent User to Journal Group & Enable Persistent Journal",
      steps: [
        "sudo usermod -a -G systemd-journal soc-agent",
        "sudo mkdir -p /var/log/journal && sudo systemd-tmpfiles --create --prefix /var/log/journal",
        "sudo systemctl restart systemd-journald soc-agent.service"
      ]
    },
    verification: "Test auth failure appears in /linux-logs within 10 seconds.",
    escalation: "Inspect /var/log/auth.log or journalctl -u ssh.service."
  },
  {
    id: "ts-10",
    symptom: "Endpoint displays 127.0.0.1 incorrectly instead of LAN IP",
    platform: "collector",
    possibleCauses: [
      "Agent defaulted to loopback before network adapter initialized",
      "Collector prioritized peer socket IP over agent-reported primary interface IP",
      "Proxy or port forwarder obscured client source address"
    ],
    diagnosticSteps: [
      { label: "Check Enrolled Agent IP", command: "Inspect /agents table IP Address column", explanation: "Check if IP is 127.0.0.1 vs 192.168.56.x." }
    ],
    safeFix: {
      title: "Agent Reports Primary Adapter IP",
      steps: [
        "SOC Monitor automatically separates agent primary IP from socket peer IP.",
        "Restart the agent service so it refreshes its primary adapter IP on heartbeat."
      ]
    },
    verification: "Agent table reflects endpoint interface IP (e.g. 192.168.56.101).",
    escalation: "Verify agent config.yaml does not have a hardcoded ip_address override."
  },
  {
    id: "ts-11",
    symptom: "Heartbeat or last-seen information is stale",
    platform: "general",
    possibleCauses: [
      "Agent heartbeat thread is blocked on slow network call",
      "Endpoint was put to sleep or VM paused",
      "Collector failed to commit heartbeat timestamp update"
    ],
    diagnosticSteps: [
      { label: "Check Agent Process", command: "Get-Process -Name SOCAgent  # (Windows) or ps aux | grep soc-agent (Linux)", explanation: "Verify agent process is actively running." }
    ],
    safeFix: {
      title: "Resume VM / Restart Service",
      steps: [
        "Unpause the virtual machine if suspended in VirtualBox.",
        "Restart the agent service to immediately send an initialization heartbeat."
      ]
    },
    verification: "Last Seen column updates to 'Just now' in /agents.",
    escalation: "Inspect collector log for database deadlock warnings on agent heartbeat."
  },
  {
    id: "ts-12",
    symptom: "OS filters show unexpected or empty results",
    platform: "backend",
    possibleCauses: [
      "Strict exact-match comparison failed on full OS strings like 'Linux 7.1.5+kali-amd64'",
      "Telemetry was not categorized under the target operating system",
      "No endpoints for that OS have been enrolled"
    ],
    diagnosticSteps: [
      { label: "Query Events by OS Filter", command: "curl -s 'http://localhost:8000/api/v1/events?operating_system=linux'", explanation: "Verify backend returns events using substring matching." }
    ],
    safeFix: {
      title: "Case-Insensitive Substring Match Active",
      steps: [
        "SOC Monitor uses case-insensitive substring matching (ilike '%windows%' / '%linux%').",
        "If results are empty, verify whether endpoints for that OS are actually enrolled in /agents."
      ]
    },
    verification: "Navigating to /live-events?os=windows displays Windows events; ?os=linux displays Linux events.",
    escalation: "Inspect event operating_system field in /raw-logs."
  },
  {
    id: "ts-13",
    symptom: "WebSocket updates are not arriving in dashboard",
    platform: "backend",
    possibleCauses: [
      "Backend server restarted and client socket has not reconnected",
      "Browser extension (ad blocker / privacy tool) blocking ws:// connections",
      "FastAPI WebSocket endpoint closed due to network timeout"
    ],
    diagnosticSteps: [
      { label: "Check Header Status", explanation: "Inspect TopBar 'Real-Time' status indicator." },
      { label: "Check WebSocket Ping/Pong", explanation: "In browser F12 Network tab, filter for 'WS', click 'ws', and inspect Messages." }
    ],
    safeFix: {
      title: "Automatic Reconnect",
      steps: [
        "useWebSocket hook automatically retries every 3 seconds.",
        "Refresh the page if reconnection fails after browser sleep."
      ]
    },
    verification: "TopBar Real-Time indicator returns to green 'CONNECTED'.",
    escalation: "Confirm backend terminal shows active client connection to /ws."
  },
  {
    id: "ts-14",
    symptom: "Backend API returns HTTP 500 / 401 / 429",
    platform: "backend",
    possibleCauses: [
      "401: Session cookie expired or invalid; user needs to log in",
      "429: Rate limit exceeded due to burst queries",
      "500: Database query exception or schema mismatch"
    ],
    diagnosticSteps: [
      { label: "Inspect Backend Terminal Log", command: "Get-Content backend log file", explanation: "Read exact Python traceback." }
    ],
    safeFix: {
      title: "Re-authenticate or Review Exception",
      steps: [
        "If 401: Visit /login and authenticate with admin credentials.",
        "If 429: Wait 60 seconds for sliding window limit to reset.",
        "If 500: Check backend log traceback for SQL column error."
      ]
    },
    verification: "Request returns HTTP 200 with JSON payload.",
    escalation: "Review Alembic database migrations."
  },
  {
    id: "ts-15",
    symptom: "Database connectivity fails (connection refused on 5432)",
    platform: "backend",
    possibleCauses: [
      "PostgreSQL service is stopped",
      "PostgreSQL credentials in .env or config are invalid",
      "Port 5432 blocked or max_connections exceeded"
    ],
    diagnosticSteps: [
      { label: "Check Postgres Windows Service", command: "Get-Service -Name postgresql*", explanation: "Verify PostgreSQL service status." }
    ],
    safeFix: {
      title: "Start PostgreSQL Service",
      steps: [
        "Start the PostgreSQL service in Services manager or PowerShell.",
        "Verify credentials match DATABASE_URL."
      ],
      command: "Start-Service -Name postgresql-x64-16"
    },
    verification: "psql -U postgres -d soc_monitor connects successfully.",
    escalation: "Check postgresql.conf listen_addresses = 'localhost'."
  },
  {
    id: "ts-16",
    symptom: "Dashboard charts show empty or zero counts",
    platform: "general",
    possibleCauses: [
      "Selected time range (24h) has no events recorded",
      "Endpoints have been enrolled for less than 1 hour",
      "No security events matching category breakdown have occurred"
    ],
    diagnosticSteps: [
      { label: "Query Overview API", command: "curl -s 'http://localhost:8000/api/v1/analytics/overview?hours=24'", explanation: "Check if events_received is non-zero." }
    ],
    safeFix: {
      title: "Verify Agent Ingestion & Generate Activity",
      steps: [
        "Confirm agent is ONLINE in /agents.",
        "Generate a test logon or command on the endpoint.",
        "Verify new count in Overview."
      ]
    },
    verification: "Timeseries area chart and severity donut render data segments.",
    escalation: "Verify timeseries API hour_bucket date_trunc query."
  },
  {
    id: "ts-17",
    symptom: "Service is running but no telemetry is collected",
    platform: "general",
    possibleCauses: [
      "Agent is failing to authenticate with collector (invalid token hash)",
      "Agent log shows HTTP 403 Forbidden on /api/v1/collector/events",
      "Local log channel on endpoint is disabled"
    ],
    diagnosticSteps: [
      { label: "Check Agent Logs for HTTP 403", command: "Select-String -Path 'C:\\Program Files\\SOCAgent\\agent.log' -Pattern '403'", explanation: "Inspect token validation rejections." }
    ],
    safeFix: {
      title: "Re-enroll Agent with Valid Code",
      steps: [
        "If token hash was desynchronized, retire the stale agent in /agents.",
        "Re-run installer script with a freshly generated enrollment code."
      ]
    },
    verification: "Agent log displays 'Successfully shipped 20 events (HTTP 200)'.",
    escalation: "Inspect collector token_hash verification in collector/app/routes.py."
  },
  {
    id: "ts-18",
    symptom: "Historical events are missing in History view",
    platform: "backend",
    possibleCauses: [
      "Agent provenance filter was set to an agent that recorded no events in that channel",
      "Channel filter is too restrictive",
      "Events are indexed beyond the default pagination limit"
    ],
    diagnosticSteps: [
      { label: "Clear Filters", explanation: "Set Agent Provenance to 'All Agent Provenances' and Channel to 'All Channels'." }
    ],
    safeFix: {
      title: "Reset Filter Dropdowns",
      steps: [
        "Select 'All Agent Provenances' in /windows-history or /linux-history.",
        "Clear the search text box and set severity to 'All Severities'."
      ]
    },
    verification: "Paginated list of historical events renders with pagination controls.",
    escalation: "Query select count(*) from event in PostgreSQL."
  },
  {
    id: "ts-19",
    symptom: "A retired agent is still represented in active fleet counts",
    platform: "backend",
    possibleCauses: [
      "Agent retirement endpoint was not called (agent was merely stopped)",
      "Analytics endpoint did not exclude RETIRED status from health count"
    ],
    diagnosticSteps: [
      { label: "Check Agent Status in DB", command: "SELECT agent_id, status FROM agent;", explanation: "Confirm status is RETIRED vs OFFLINE." }
    ],
    safeFix: {
      title: "Retire Agent in Agents View",
      steps: [
        "In /agents, locate the offline agent.",
        "Click 'Retire Agent' action button.",
        "Confirm modal prompt."
      ]
    },
    verification: "Agent moves to 'Retired History' tab and is excluded from active fleet count.",
    escalation: "Verify /analytics/agents endpoint filters out status = 'RETIRED'."
  },
  {
    id: "ts-20",
    symptom: "Frontend cannot reach backend (API: OFFLINE in header)",
    platform: "backend",
    possibleCauses: [
      "Backend uvicorn process on port 8000 is stopped",
      "Port 8000 is occupied by another process",
      "Backend crashed during startup on unhandled DB migration"
    ],
    diagnosticSteps: [
      { label: "Check Port 8000", command: "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue", explanation: "Check if port 8000 is listening." },
      { label: "Test Backend Health", command: "curl -s http://127.0.0.1:8000/docs", explanation: "Verify Swagger documentation loads." }
    ],
    safeFix: {
      title: "Start Backend Uvicorn Process",
      steps: [
        "Start backend with PYTHONPATH set to project root.",
        "Ensure DATABASE_URL is set in environment."
      ],
      command: "python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"
    },
    verification: "TopBar API status indicator changes from red 'OFFLINE' to green 'ONLINE'.",
    escalation: "Inspect backend terminal error stack trace."
  },
  {
    id: "ts-21",
    symptom: "Firewall or VirtualBox VM networking blocks connectivity",
    platform: "network",
    possibleCauses: [
      "VirtualBox network adapter set to NAT instead of Host-Only Adapter",
      "Host Windows Firewall blocking incoming packets from 192.168.56.0/24 subnet"
    ],
    diagnosticSteps: [
      { label: "Check VM IP Address", command: "ip addr show eth0  # (inside Kali VM)", explanation: "Confirm VM has an IP on 192.168.56.x subnet." },
      { label: "Ping Host from VM", command: "ping -c 3 192.168.56.1", explanation: "Test ICMP connectivity to host." }
    ],
    safeFix: {
      title: "Configure Host-Only Adapter in VirtualBox",
      steps: [
        "In VirtualBox VM Settings → Network → Adapter 1:",
        "Set 'Attached to: Host-only Adapter', Name: 'VirtualBox Host-Only Ethernet Adapter'.",
        "Inside VM: sudo dhclient eth0"
      ]
    },
    verification: "curl http://192.168.56.1:5000/health from VM returns HTTP 200.",
    escalation: "Verify Windows Firewall profile for VirtualBox adapter is Private."
  },
  {
    id: "ts-22",
    symptom: "Windows install fails: Script execution policy restricted",
    platform: "windows",
    possibleCauses: [
      "PowerShell default ExecutionPolicy is Restricted"
    ],
    diagnosticSteps: [
      { label: "Check ExecutionPolicy", command: "Get-ExecutionPolicy", explanation: "Check if policy is Restricted." }
    ],
    safeFix: {
      title: "Bypass ExecutionPolicy for Script Invocation",
      steps: [
        "Launch PowerShell with -ExecutionPolicy Bypass flag."
      ],
      command: "powershell.exe -ExecutionPolicy Bypass -File .\\artifacts\\install-agent.ps1 ..."
    },
    verification: "Installer executes without execution policy warning.",
    escalation: "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass"
  },
  {
    id: "ts-23",
    symptom: "Linux install fails: State directory permissions prevent registration",
    platform: "linux",
    possibleCauses: [
      "/var/lib/soc-agent owned by root instead of soc-agent user",
      "SELinux or AppArmor denying write access"
    ],
    diagnosticSteps: [
      { label: "Check Permissions", command: "ls -ld /var/lib/soc-agent", explanation: "Inspect ownership and write bits." }
    ],
    safeFix: {
      title: "Fix Ownership of State Directory",
      steps: [
        "sudo chown -R soc-agent:soc-agent /var/lib/soc-agent",
        "sudo chmod 750 /var/lib/soc-agent"
      ]
    },
    verification: "Agent writes state successfully without permission errors.",
    escalation: "Check dmesg for AppArmor audit denials."
  },
  {
    id: "ts-24",
    symptom: "Windows installation fails: Missing runtime dependencies",
    platform: "windows",
    possibleCauses: [
      "Visual C++ 2015-2022 Redistributable (x64) is not installed",
      "Target system is missing universal CRT"
    ],
    diagnosticSteps: [
      { label: "Check VC++ Runtime", command: "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object DisplayName -like '*Visual C++*'", explanation: "Verify VC++ Redistributable presence." }
    ],
    safeFix: {
      title: "Install Visual C++ Redistributable (x64)",
      steps: [
        "Download and install vc_redist.x64.exe from Microsoft.",
        "Re-run install-agent.ps1."
      ]
    },
    verification: "soc-agent-windows.exe launches without VCRUNTIME140.dll missing error.",
    escalation: "Check Windows Update for pending cumulative updates."
  },
  {
    id: "ts-25",
    symptom: "YAML parsing fails due to unquoted Windows backslashes",
    platform: "windows",
    possibleCauses: [
      "Path in config.yaml written as C:\\Program Files\\SOCAgent without quotes, causing YAML parser to treat \\ as escape character"
    ],
    diagnosticSteps: [
      { label: "Check YAML Error", command: "Select-String -Path 'C:\\Program Files\\SOCAgent\\agent.log' -Pattern 'yaml'", explanation: "Inspect YAML syntax error." }
    ],
    safeFix: {
      title: "Quote Paths or Use Forward Slashes",
      steps: [
        "In config.yaml, write paths with forward slashes: 'C:/Program Files/SOCAgent/data'",
        "Or wrap in double quotes with double backslashes: \"C:\\\\Program Files\\\\SOCAgent\\\\data\""
      ]
    },
    verification: "Agent parses config without ScannerError / ParserError.",
    escalation: "Validate config.yaml with yamllint or Python yaml.safe_load."
  },
  {
    id: "ts-26",
    symptom: "Agent registration fails with HTTP 401 Unauthorized",
    platform: "collector",
    possibleCauses: [
      "The one-time enrollment token has expired (past 24h lifespan)",
      "The token has already been consumed by an existing agent registration",
      "The token was truncated or modified during copy/paste",
      "Target OS mismatch between token generation and target machine"
    ],
    diagnosticSteps: [
      { label: "Inspect Linux Journalctl for 401 Rejection", command: "sudo journalctl -u soc-agent.service -n 50 --no-pager | grep -iE \"401|invalid|expired\"", explanation: "Confirm whether the server rejected the token with HTTP 401." },
      { label: "Inspect Windows Agent Log for Rejection", command: "Select-String -Path 'C:\\ProgramData\\SOCMonitorAgent\\agent.log' -Pattern '401|rejected'", explanation: "Search for token rejection in Windows agent log." }
    ],
    safeFix: {
      title: "Generate a Fresh One-Time Enrollment Token",
      steps: [
        "In the SOC Monitor dashboard header, click '+ Add Endpoint'.",
        "Select the appropriate operating system (Linux or Windows).",
        "Copy the newly generated one-time token.",
        "Re-run the installer supplying the new token via AGENTAUTHTOKEN or secure prompt."
      ],
      command: "sudo AGENTAUTHTOKEN=\"<FRESH_TOKEN>\" ./install-agent.sh --host \"COLLECTOR_HOST\" --port 5000"
    },
    verification: "sudo journalctl -u soc-agent.service -n 20 --no-pager shows 'Agent registered successfully'.",
    escalation: "Check collector service console logs on port 5000 to verify token validation reason."
  },
  {
    id: "ts-27",
    symptom: "Linux installer fails: syntax error near unexpected token '(' while looking for matching ')'",
    platform: "linux",
    possibleCauses: [
      "Unbalanced or incorrectly escaped single quotes inside installer quote-stripping pipeline",
      "Stale or truncated installer script downloaded from older collector build"
    ],
    diagnosticSteps: [
      { label: "Validate Script Syntax (No Execution)", command: "bash -n install-agent.sh", explanation: "Verify shell syntax without executing any code." },
      { label: "Verify Endpoint Script Content", command: "curl -sS http://COLLECTOR_HOST:5000/api/v1/agents/download/install-agent.sh | bash -n", explanation: "Test the live download endpoint syntax directly." }
    ],
    safeFix: {
      title: "Download Verified Installer & Validate Syntax",
      steps: [
        "Re-download the authoritative installer script from the collector.",
        "Run bash -n install-agent.sh to verify exit code 0.",
        "Execute the verified script with sudo."
      ],
      command: "curl -fsSL \"http://COLLECTOR_HOST:5000/api/v1/agents/download/install-agent.sh\" -o install-agent.sh && bash -n install-agent.sh && chmod +x install-agent.sh && sudo AGENTAUTHTOKEN=\"<TOKEN>\" ./install-agent.sh --host \"COLLECTOR_HOST\" --port 5000"
    },
    verification: "bash -n install-agent.sh returns exit code 0 with no errors.",
    escalation: "Inspect artifacts/install-agent.sh on host for tr -d quote formatting."
  },
  {
    id: "ts-28",
    symptom: "Kali Linux / VM cannot reach Collector on port 5000 (Host-Only vs NAT mismatch)",
    platform: "network",
    possibleCauses: [
      "Kali VM is attempting to reach host Wi-Fi/LAN IP instead of VirtualBox Host-Only Adapter IP (192.168.56.1)",
      "Collector is bound to 127.0.0.1 instead of 0.0.0.0",
      "Windows Firewall blocking inbound port 5000 on VirtualBox private adapter"
    ],
    diagnosticSteps: [
      { label: "Inspect VM Interface IP", command: "ip -br addr", explanation: "Verify VM is assigned an IP in the 192.168.56.0/24 subnet (e.g. 192.168.56.102)." },
      { label: "Test Collector API Reachability", command: "curl -sS -o /dev/null -w \"HTTP %{http_code}\\n\" http://192.168.56.1:5000/docs", explanation: "Verify HTTP 200 is returned from collector docs." }
    ],
    safeFix: {
      title: "Point Agent to VirtualBox Host-Only Gateway IP (192.168.56.1)",
      steps: [
        "Use 192.168.56.1 as the collector host argument.",
        "Ensure collector on Windows is running with --host 0.0.0.0 --port 5000.",
        "Allow inbound TCP 5000 on Windows Firewall for the VirtualBox network adapter."
      ],
      command: "curl -sS -o /dev/null -w \"HTTP %{http_code}\\n\" http://192.168.56.1:5000/docs"
    },
    verification: "curl from Kali VM returns HTTP 200.",
    escalation: "In PowerShell run: Get-NetTCPConnection -LocalPort 5000 -State Listen"
  },
  {
    id: "ts-29",
    symptom: "Agent service is active but dashboard shows endpoint as OFFLINE",
    platform: "general",
    possibleCauses: [
      "Service started (Stage 1) but registration failed (Stage 2) with HTTP 401",
      "Heartbeat interval exceeded the 5-minute timeout window (Stage 3 failure)",
      "Collector and Backend are pointing to different database connections"
    ],
    diagnosticSteps: [
      { label: "Check Linux Daemon Logs", command: "sudo journalctl -u soc-agent.service -n 50 --no-pager", explanation: "Inspect heartbeat transmission responses (200 OK vs 401/403)." },
      { label: "Check Windows Agent Logs", command: "Get-Content -Tail 50 \"C:\\ProgramData\\SOCMonitorAgent\\agent.log\"", explanation: "Inspect Windows agent heartbeat status." }
    ],
    safeFix: {
      title: "Diagnose Four-Stage Agent Lifecycle",
      steps: [
        "Inspect service logs to confirm genuine registration success beyond process startup.",
        "Verify heartbeat loop transmits every 60 seconds.",
        "Ensure collector and backend services share the same database URL."
      ],
      command: "sudo systemctl restart soc-agent.service && sudo journalctl -u soc-agent.service -f"
    },
    verification: "Within 60 seconds, /agents status column changes to ONLINE (Green).",
    escalation: "Query backend /api/v1/agents/ endpoint directly to verify last_seen timestamp."
  },
  {
    id: "ts-30",
    symptom: "Linux agent is ONLINE but no security events appear in Live Events or Linux Logs",
    platform: "linux",
    possibleCauses: [
      "Endpoint has generated no new authentication or system events while idle",
      "soc-agent user lacks read permissions on systemd journal (/var/log/journal)",
      "journald_enabled is set to false in /etc/soc-monitor-agent/agent.yml"
    ],
    diagnosticSteps: [
      { label: "Generate Harmless Local Test Log", command: "logger \"SOC Monitor test event from Kali Linux\"", explanation: "Write a test entry into the local syslog / journal." },
      { label: "Verify Message in Local Journal", command: "sudo journalctl -n 10 --no-pager | grep \"SOC Monitor test event\"", explanation: "Confirm the message was written locally." },
      { label: "Check Ingestion Log in Agent", command: "sudo journalctl -u soc-agent.service -n 30 --no-pager | grep -iE \"batch|event\"", explanation: "Check if the agent shipped the batch." }
    ],
    safeFix: {
      title: "Add soc-agent User to Journal Group & Verify Ingestion",
      steps: [
        "Ensure soc-agent user is in systemd-journal group: sudo usermod -aG systemd-journal soc-agent",
        "Generate a test event using the logger command.",
        "Check Linux Live Events in the dashboard (/live-events?os=linux)."
      ],
      command: "logger \"SOC Monitor test event from Kali Linux\""
    },
    verification: "Test event appears in /live-events or /linux-logs within 10 seconds.",
    escalation: "Inspect collector terminal for incoming POST /api/v1/collector/events payloads."
  },
  {
    id: "ts-31",
    symptom: "Interactive shell error on token input: read: -p: no coprocess (Zsh vs Bash disparity)",
    platform: "linux",
    possibleCauses: [
      "Executing Bash-specific read -p syntax in modern default Zsh shell (Kali Linux)",
      "Pasting multi-command one-liner with conflicting shell options"
    ],
    diagnosticSteps: [
      { label: "Check Current Shell", command: "echo $0 && echo $SHELL", explanation: "Determine if current interactive shell is /usr/bin/zsh or /bin/bash." }
    ],
    safeFix: {
      title: "Run Installer Interactively or Prefix Command with Space",
      steps: [
        "Run the installer directly: sudo ./install-agent.sh --host \"COLLECTOR_HOST\" --port 5000",
        "The script runs internally under Bash (#!/usr/bin/env bash) and uses masked prompt without shell history leakage.",
        "Alternatively, in Bash/Zsh prefix the export with a space:  sudo AGENTAUTHTOKEN=\"<TOKEN>\" ./install-agent.sh ..."
      ],
      command: "sudo ./install-agent.sh --host \"COLLECTOR_HOST\" --port 5000"
    },
    verification: "Installer prompts securely for token: 'Enrollment Token (hidden): '.",
    escalation: "Explicitly invoke under Bash: bash ./install-agent.sh --host \"COLLECTOR_HOST\""
  },
  {
    id: "ts-32",
    symptom: "Testing Windows event collection with custom verification marker fails: 'The source was not found'",
    platform: "windows",
    possibleCauses: [
      "PowerShell Write-EventLog requires an existing registered EventSource in the Windows Registry before writing",
      "Using non-elevated terminal when attempting to register a new event source",
      "EventCreate utility not given /ID between 1 and 1000"
    ],
    diagnosticSteps: [
      { label: "Verify Registered Sources", command: "[System.Diagnostics.EventLog]::SourceExists('SOCMonitorTest')", explanation: "Check if the test event source is already registered." },
      { label: "Test with eventcreate utility", command: "eventcreate /L APPLICATION /T INFORMATION /SO \"SOCMonitor\" /ID 100 /D \"SOCMON-VERIFY-TEST-01: Windows harmless test marker\"", explanation: "Use standard built-in eventcreate tool." }
    ],
    safeFix: {
      title: "Register Harmless EventSource or Use Built-in eventcreate",
      steps: [
        "In an elevated PowerShell, register a dedicated test source once: New-EventLog -LogName Application -Source 'SOCMonitor' -ErrorAction SilentlyContinue",
        "Write the marker: Write-EventLog -LogName Application -Source 'SOCMonitor' -EventId 100 -EntryType Information -Message 'SOCMON-VERIFY-TEST-01'",
        "Or use eventcreate directly from any command prompt: eventcreate /L APPLICATION /T INFORMATION /SO \"SOCMonitor\" /ID 100 /D \"SOCMON-VERIFY-TEST-01\""
      ],
      command: "eventcreate /L APPLICATION /T INFORMATION /SO \"SOCMonitor\" /ID 100 /D \"SOCMON-VERIFY-TEST-01\""
    },
    verification: "Searching for 'SOCMON-VERIFY-TEST-01' in /windows-logs or /raw-logs returns the generated event.",
    escalation: "Confirm Windows Agent configuration includes 'Application' in enabled_channels."
  },
  {
    id: "ts-33",
    symptom: "Operational Safety Checklist: Preserving Database Integrity and Telemetry Authenticity",
    platform: "general",
    possibleCauses: [
      "Accidentally wiping PostgreSQL database or dropping tables when resolving service issues",
      "Hardcoding mock data or fake event counts instead of querying real backend telemetry",
      "Exposing sensitive agent auth tokens or DB credentials in shell command history"
    ],
    diagnosticSteps: [
      { label: "Check Database Table Row Counts", command: "psql -U postgres -d soc_monitor -c \"SELECT 'events' as tbl, count(*) FROM event UNION ALL SELECT 'raw_logs', count(*) FROM raw_log;\"", explanation: "Verify real ingested records." }
    ],
    safeFix: {
      title: "Follow SOC Monitor Data Safety Standard Operating Procedures",
      steps: [
        "DO NOT drop, truncate, or wipe PostgreSQL database tables. Historical provenance is critical for investigations.",
        "DO NOT introduce mock telemetry or hardcoded chart metrics; all dashboard numbers must derive from real database queries.",
        "DO always mask enrollment tokens in logs, URLs, and screenshots using SHA-256 digests or [REDACTED].",
        "DO use bounded queries (e.g., journalctl -n 200 or PowerShell -Tail) to avoid long processing freezes on large event logs."
      ]
    },
    verification: "Fleet analytics, investigation timelines, and raw log queries accurately reflect authentic endpoint telemetry.",
    escalation: "Refer to Help Center category 'Safety & Maintenance' for scheduled vacuuming and retention policies."
  }
];

export const TROUBLESHOOTING_ITEMS = TROUBLESHOOTING_LIBRARY;

export const GLOSSARY_ITEMS: GlossaryItem[] = [
  {
    term: "Agent",
    category: "core",
    definition: "A lightweight background service installed on a Windows or Linux endpoint that monitors system activity, extracts security logs, and securely ships telemetry to the Collector.",
    practicalExample: "The Windows Agent executes as 'SOCAgent' service and ships EventID 4624/4688 records to port 5000.",
    relatedTopicId: "hosts-vs-agents"
  },
  {
    term: "Alert",
    category: "detection",
    definition: "A prioritized security notification generated when incoming events match a detection rule, indicating potential adversarial activity or policy violation.",
    practicalExample: "An alert with severity HIGH is created when 10 failed logons occur within 60 seconds from the same IP.",
    relatedTopicId: "detections-alerts-workflow"
  },
  {
    term: "Attack Timeline",
    category: "investigation",
    definition: "A chronological visual reconstruction of security events, alerts, and analyst findings across one or more hosts over a specific investigation period.",
    practicalExample: "The Attack Timeline displays the initial brute-force attempt at 10:14 followed by process execution at 10:20.",
    relatedTopicId: "attack-timeline-guide"
  },
  {
    term: "Channel (Windows)",
    category: "windows",
    definition: "A distinct log stream in the Windows Event Log infrastructure categorized by function, such as Security, System, Application, or Microsoft-Windows-Sysmon/Operational.",
    practicalExample: "EventID 4624 is found in the 'Security' channel, while EventID 7045 is logged in the 'System' channel.",
    relatedTopicId: "windows-overview-logs"
  },
  {
    term: "Collector",
    category: "core",
    definition: "The FastAPI ingestion service running on port 5000 that validates agent tokens, accepts batches of events, normalizes metadata, and writes directly to PostgreSQL.",
    practicalExample: "Endpoints send HTTP POST requests with JSON envelopes to http://192.168.56.1:5000/api/v1/collector/events.",
    relatedTopicId: "architecture-dataflow"
  },
  {
    term: "Detection Rule",
    category: "detection",
    definition: "A structured logic pattern aligned with MITRE ATT&CK techniques used by the detection engine to evaluate events for threats.",
    practicalExample: "Rule 'SUSPICIOUS_POWERSHELL_EXEC' checks for process events containing '-EncodedCommand' or '-ExecutionPolicy Bypass'.",
    relatedTopicId: "detections-alerts-workflow"
  },
  {
    term: "Enrollment Token",
    category: "core",
    definition: "A cryptographically generated secret code used during agent installation to authorize and register the agent with the Collector.",
    practicalExample: "An analyst generates a token in 'Add Endpoint' and supplies it to install-agent.ps1.",
    relatedTopicId: "hosts-vs-agents"
  },
  {
    term: "Event",
    category: "core",
    definition: "An atomic, timestamped record of an action that occurred on an endpoint, normalized into a structured schema with severity, host, and category.",
    practicalExample: "A successful user login, a spawned process, or a blocked firewall connection.",
    relatedTopicId: "core-entities"
  },
  {
    term: "Event ID (Windows)",
    category: "windows",
    definition: "A standardized numeric code assigned by Microsoft or Sysmon that specifies the exact type of event recorded in the Windows Event Log.",
    practicalExample: "Event ID 4624 signifies 'An account was successfully logged on'.",
    relatedTopicId: "windows-eventids"
  },
  {
    term: "Event Record ID",
    category: "windows",
    definition: "A strictly sequential integer assigned by Windows to each log entry within a specific channel, useful for proving the exact sequence of events.",
    practicalExample: "EventRecordID 10842 occurred immediately before EventRecordID 10843 in the Security log.",
    relatedTopicId: "windows-overview-logs"
  },
  {
    term: "Heartbeat",
    category: "core",
    definition: "A periodic periodic check-in message sent by an agent every 30-60 seconds to notify the collector that the agent is active and healthy.",
    practicalExample: "If no heartbeat is received for > 300 seconds, the agent status transitions to OFFLINE.",
    relatedTopicId: "hosts-vs-agents"
  },
  {
    term: "Host",
    category: "core",
    definition: "A unique physical computer or virtual machine operating system container, identified by its hostname and hardware profile.",
    practicalExample: "'Vishal-S' is a Windows host; 'vbox' is a Kali Linux virtual machine host.",
    relatedTopicId: "hosts-vs-agents"
  },
  {
    term: "Investigation",
    category: "investigation",
    definition: "An interactive case file created by an analyst to gather evidence, correlate events, document findings, and manage incident resolution.",
    practicalExample: "Investigation #14 aggregates 3 alerts and 12 events to document an unauthorized RDP intrusion.",
    relatedTopicId: "investigations-guide"
  },
  {
    term: "Journald (Linux)",
    category: "linux",
    definition: "The systemd logging daemon in Linux that captures, indexes, and stores system, kernel, and daemon log messages in binary format.",
    practicalExample: "The Linux agent queries journald to extract auth, sshd, and sudo activity.",
    relatedTopicId: "linux-overview-logs"
  },
  {
    term: "MITRE ATT&CK",
    category: "detection",
    definition: "A globally accessible knowledge base of adversary tactics and techniques based on real-world cyber attack observations.",
    practicalExample: "SOC Monitor maps logon failures to Credential Access (T1110) and script execution to Execution (T1059).",
    relatedTopicId: "mitre-matrix"
  },
  {
    term: "Normalization",
    category: "core",
    definition: "The process of transforming raw, vendor-specific log formats from Windows and Linux into a uniform, searchable schema with standardized fields.",
    practicalExample: "Converting Windows Event 4624 and Linux sshd 'Accepted password' both into event_category='authentication'.",
    relatedTopicId: "architecture-dataflow"
  },
  {
    term: "Priority (systemd)",
    category: "linux",
    definition: "A numeric value from 0 (Emergency) to 7 (Debug) assigned to Linux log entries by systemd to indicate severity.",
    practicalExample: "Priority 3 represents an Error, mapped by SOC Monitor to HIGH severity.",
    relatedTopicId: "linux-priority-metadata"
  },
  {
    term: "Provenance",
    category: "core",
    definition: "The verifiable origin and lifecycle history of an event, including the exact agent session, hostname, channel, and timestamp.",
    practicalExample: "Proving that an event was generated by a retired agent session prior to de-provisioning.",
    relatedTopicId: "history-provenance"
  },
  {
    term: "Raw Log",
    category: "core",
    definition: "The unaltered original text or JSON payload shipped by the agent before parsing, stored for forensic and compliance integrity.",
    practicalExample: "Inspecting the exact raw XML or syslog string in the Event Details Modal.",
    relatedTopicId: "raw-logs-explorer"
  },
  {
    term: "Retired Agent",
    category: "core",
    definition: "An agent that has been formally decommissioned. Its historical events are preserved while excluding it from active fleet health counts.",
    practicalExample: "Agent 'agent-5c84...' marked as RETIRED after a host was rebuilt.",
    relatedTopicId: "history-provenance"
  },
  {
    term: "Severity",
    category: "detection",
    definition: "A standardized priority classification (CRITICAL, HIGH, MEDIUM, LOW, INFO) indicating the urgency and potential impact of an event or alert.",
    practicalExample: "A CRITICAL severity alert requires immediate analyst triage within 15 minutes.",
    relatedTopicId: "detections-alerts-workflow"
  },
  {
    term: "Syslog Identifier",
    category: "linux",
    definition: "A metadata tag in Linux systemd journal logs that identifies the program or daemon responsible for a log entry.",
    practicalExample: "SYSLOG_IDENTIFIER='sudo' indicates the message originated from the sudo privilege manager.",
    relatedTopicId: "linux-overview-logs"
  },
  {
    term: "Sysmon",
    category: "windows",
    definition: "System Monitor: a Microsoft Sysinternals utility that provides advanced security logging on Windows, including process command lines and network sockets.",
    practicalExample: "Sysmon Event ID 1 provides full SHA256 hashes of spawned executables.",
    relatedTopicId: "windows-eventids"
  },
  {
    term: "Systemd Unit",
    category: "linux",
    definition: "A Linux service, socket, or device managed by systemd, whose logs are indexed under the _SYSTEMD_UNIT field.",
    practicalExample: "Unit 'ssh.service' contains all inbound SSH connection attempts.",
    relatedTopicId: "linux-overview-logs"
  },
  {
    term: "Tactic (ATT&CK)",
    category: "detection",
    definition: "The overarching tactical objective of an adversary at a specific phase of an attack in the MITRE ATT&CK framework.",
    practicalExample: "'Persistence' represents the goal of maintaining access across restarts.",
    relatedTopicId: "mitre-matrix"
  },
  {
    term: "Technique (ATT&CK)",
    category: "detection",
    definition: "The specific technical method used by an adversary to achieve a tactical objective.",
    practicalExample: "'T1059.001' represents PowerShell command-line execution.",
    relatedTopicId: "mitre-matrix"
  },
  {
    term: "Unified Explorer",
    category: "core",
    definition: "A global search and filter interface (/raw-logs) that allows cross-operating-system querying of all stored events and raw payloads.",
    practicalExample: "Searching for a suspicious domain name across both Windows and Linux endpoints simultaneously.",
    relatedTopicId: "raw-logs-explorer"
  },
  {
    term: "WebSocket",
    category: "core",
    definition: "A full-duplex TCP communication protocol used by SOC Monitor (/ws) to push real-time alerts and live events to the browser without polling.",
    practicalExample: "New events appear instantly on /live-events as soon as the collector receives them.",
    relatedTopicId: "live-stream-websocket"
  }
];

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: "How does SOC Monitor differ from an enterprise SIEM like Splunk or Elastic?",
    answer: "SOC Monitor is an ultra-lightweight, dedicated security monitoring console designed for minimal footprint and zero external cloud dependencies. It directly parses Windows Event Logs and Linux systemd journald streams, persists to PostgreSQL, and offers instant interactive triaging with zero query language learning curve.",
    category: "General",
    relatedTopicId: "overview-mission"
  },
  {
    question: "Does the Windows Agent capture command line arguments for spawned processes?",
    answer: "Yes, when Process Creation Auditing (EventID 4688) with 'Include command line in process creation events' is enabled in Windows Local Security Policy, or when Sysmon is installed (EventID 1). The full command line is extracted into the event metadata.",
    category: "Windows",
    relatedTopicId: "windows-eventids"
  },
  {
    question: "Does the Linux Agent require rsyslog to be running?",
    answer: "No. The Linux Agent reads directly from systemd journald (/run/log/journal or /var/log/journal). It does not require traditional rsyslog or syslog-ng daemons, although standard syslog entries forwarded to journald are fully captured.",
    category: "Linux",
    relatedTopicId: "linux-overview-logs"
  },
  {
    question: "Can an agent be enrolled more than once with the same enrollment code?",
    answer: "No. Enrollment codes are one-time use tokens by default. Once an agent successfully registers and receives its private agent token, the enrollment code is consumed. For new installations, generate a fresh code in '+ Add Endpoint'.",
    category: "Enrollment",
    relatedTopicId: "hosts-vs-agents"
  },
  {
    question: "What happens to historical logs when an agent is retired?",
    answer: "All historical events, raw logs, and alerts generated by that agent remain permanently preserved in the PostgreSQL database. Retiring an agent simply updates its status to RETIRED so it no longer counts against active fleet health ratios.",
    category: "Fleet Management",
    relatedTopicId: "history-provenance"
  },
  {
    question: "Why does my Kali Linux VM show IP address 127.0.0.1 in older records?",
    answer: "Before recent IP attribution improvements, the agent could default to loopback if its network adapter had not acquired an IP via DHCP when the service initialized. Current versions explicitly detect the primary host-only interface (e.g. 192.168.56.101).",
    category: "Troubleshooting",
    relatedTopicId: "troubleshooting-library"
  },
  {
    question: "Does SOC Monitor support automated alert notifications (Email / Slack / Webhook)?",
    answer: "Currently, SOC Monitor broadcasts notifications in real time via WebSockets to connected browser dashboards (with toast notifications). External email/webhook notification dispatchers are planned for future releases.",
    category: "Detections",
    relatedTopicId: "detections-alerts-workflow"
  },
  {
    question: "Is raw packet inspection or PCAP capture supported in Network view?",
    answer: "No. SOC Monitor is an endpoint telemetry monitor, not a Network Intrusion Detection System (NIDS) like Zeek or Snort. The Network view displays socket connection metadata (IPs, ports, protocols, process names) recorded by endpoint agents.",
    category: "Network",
    relatedTopicId: "network-monitoring"
  },
  {
    question: "How long are events retained in the database?",
    answer: "Events are retained indefinitely in development environments unless a retention policy is configured in /settings/retention. In production, automated partitioning or cleanup jobs can be scheduled.",
    category: "Architecture",
    relatedTopicId: "history-provenance"
  },
  {
    question: "Can I run the Collector on a different server from the Dashboard?",
    answer: "Yes. The Collector is a standalone FastAPI service bound to port 5000 that connects directly to the shared PostgreSQL database. Endpoints simply need TCP connectivity to the Collector IP and port.",
    category: "Architecture",
    relatedTopicId: "architecture-dataflow"
  }
];
