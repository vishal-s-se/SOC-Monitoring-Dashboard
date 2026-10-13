# SOCForge — Enterprise Defensive Cybersecurity & Telemetry Platform

**SOCForge** (**Monitor. Investigate. Defend.**) is an enterprise-grade Security Operations Center (SOC) monitoring and defensive SIEM platform designed for centralized endpoint telemetry collection, normalization, real-time threat detection, correlation, alerting, forensics, interactive timeline visualization, and guided audit PDF reporting.

---

## 1. Project Overview & Current Status

SOCForge provides hybrid Windows and Linux host monitoring with a FastAPI backend, an asynchronous ingestion collector, a Next.js real-time analyst dashboard, and dedicated endpoint agents.

### Current Implementation Status
- **Current Version:** `0.1.0`
- **Maturity Level:** Production-ready for dedicated lab, enterprise staging, and on-premises environments.
- **Data Isolation:** Complete. Fresh checkouts connect to the operator's own PostgreSQL database. **No telemetry, events, credentials, or agent keys are shared or hardcoded.**
- **Real-Time Delivery:** Native WebSockets push events and alerts to connected browsers without client polling.

### Honest Limitations & Operational Boundaries
1. **Network Intrusion Detection (NIDS):** SOC Monitor is an **endpoint telemetry and host-based monitor**, not a packet-capture or NIDS engine (such as Zeek or Snort). Network telemetry represents socket connections, open ports, and connection states reported by endpoints.
2. **Administrative Privileges:** Windows Event Log collection from the `Security` channel requires local Administrator privileges (`SeSecurityPrivilege`). Standard user accounts can only collect `Application` and `System` channels.
3. **Linux Kernel & Audit:** Detailed process execution lineage on Linux requires `auditd` or `systemd-journald` persistent storage (`/var/log/journal`).
4. **Multi-Tenancy:** The current database model is single-tenant per deployment instance. Teams requiring multi-tenant customer isolation should deploy separate instances per organization.

---

## 2. System Architecture

```
                  ┌───────────────────────────────────────────────┐
                  │            ENDPOINT AGENTS FLEET              │
                  ├───────────────────────┬───────────────────────┤
                  │     Windows Agent     │      Linux Agent      │
                  │  (WinEventLog / ETW)  │  (journald / syslog)  │
                  └───────────┬───────────┴───────────┬───────────┘
                              │                       │
                              │ HTTP POST (TLS/Token) │
                              ▼                       ▼
                  ┌───────────────────────────────────────────────┐
                  │             COLLECTOR SERVICE                 │
                  │         (FastAPI : Port 5000)                 │
                  │  • Agent Authentication & Tokens (SHA-256)    │
                  │  • Payload Validation & Rate Limiting         │
                  │  • Raw Log Persistence (raw_log table)        │
                  │  • Field Extraction & Taxonomy Normalization  │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │            POSTGRESQL DATABASE                │
                  │                (Port 5432)                    │
                  │  • raw_log        • event        • alert      │
                  │  • host           • agent        • user       │
                  │  • investigation  • detection_rule            │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │               BACKEND API                     │
                  │         (FastAPI : Port 8000)                 │
                  │  • Detection Engine (Single-event rules)      │
                  │  • Correlation Engine (Behavioral patterns)   │
                  │  • MITRE ATT&CK Mapping & Threat Intelligence │
                  │  • Forensic Investigations & Timelines        │
                  │  • Real-time Event Bus (WebSocket broadcast)  │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │          ANALYST DASHBOARD (FRONTEND)         │
                  │            (Next.js : Port 3000)              │
                  │  • Live Events Stream      • Windows Logs     │
                  │  • Linux Logs Explorer     • Unified Raw Logs │
                  │  • Alert Triage & Matrix   • Investigations   │
                  │  • System Health & Diagnostics                │
                  └───────────────────────────────────────────────┘
```

---

## 3. Feature Support Matrix

| Category | Capability | Status | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Telemetry** | Windows Application & System | **Fully Supported** | Native `win32evtlog` channel reader |
| **Telemetry** | Windows Security Channel | **Fully Supported** | Requires Administrator / Elevated Service |
| **Telemetry** | Windows Sysmon / Defender | **Fully Supported** | Configurable channel subscription |
| **Telemetry** | Linux systemd-journald | **Fully Supported** | Cursor-tracked, bounded non-blocking ingestion |
| **Telemetry** | Linux Traditional Syslog | **Fully Supported** | Fallback file reader for `/var/log/*` |
| **Telemetry** | WSL (Windows Subsystem for Linux)| **Fully Supported** | Monitors WSL guest OS environment |
| **Ingestion** | Full-Text Payload Search | **Fully Supported** | Cross-field SQL ILIKE search with raw payload outer join |
| **Ingestion** | Event Taxonomy Normalization | **Fully Supported** | 12 standardized categories (`authentication`, `process`, etc.) |
| **Detections** | Single-Event Detection Rules | **Fully Supported** | YAML-based / Seeded MITRE ATT&CK rules catalog |
| **Detections** | Stateful Behavioral Correlation| **Fully Supported** | Brute force, port scan, outbound burst, lateral movement |
| **UI** | Real-Time WebSocket Delivery | **Fully Supported** | Broadcasts instant notifications to `/live-events` |
| **UI** | Forensic Investigation Cases | **Fully Supported** | Evidence aggregation, markdown notes, attack timelines |
| **Deployment**| Windows Native PowerShell | **Fully Supported** | Validated via `Start-SOCMonitor.ps1` |
| **Deployment**| Linux Native systemd / Virtualenv | **Fully Supported** | Documented in `README-DEPLOYMENT.md` |
| **Deployment**| Docker & Docker Compose | **Documented Roadmap**| Architecture and compose blueprint in `README-DEPLOYMENT.md` |

---

## 4. Operating System & Software Prerequisites

| Component | Minimum Version | Recommended Version | Tested On |
| :--- | :--- | :--- | :--- |
| **Python** | 3.10+ | 3.12 | Python 3.12.10 (64-bit) |
| **Node.js** | 18.17+ | 20.x LTS | Node.js v20.18.0 |
| **npm** | 9.x+ | 10.x | npm 10.8.2 |
| **PostgreSQL**| 14+ | 16+ or 18+ | PostgreSQL 18.0 (Windows Native) |
| **Windows Host**| Windows 10 (1809+) | Windows 11 / Server 2022 | Windows 11 Pro 64-bit |
| **Linux Host** | Debian 11+, Ubuntu 20.04+, Kali 2023+ | Debian 12 / Kali Linux 2024+ | Kali Linux Rolling (amd64) |

---

## 5. Quick Start (Clean Local Setup)

Follow these steps on a freshly cloned repository. **Never use maintainer credentials or copy external database dumps.**

### Step 1: Clone the Repository
```bash
git clone https://github.com/<your-org-or-username>/soc-monitor.git
cd soc-monitor
```

### Step 2: Create a Dedicated PostgreSQL Database & User
Open your PostgreSQL shell (`psql`) as superuser:
```sql
-- Create a secure dedicated user
CREATE USER soc_user WITH ENCRYPTED PASSWORD 'StrongPasswordHere123!';

-- Create the dedicated database
CREATE DATABASE soc_monitor OWNER soc_user;

-- Grant required schema privileges
GRANT ALL PRIVILEGES ON DATABASE soc_monitor TO soc_user;
\c soc_monitor
GRANT ALL ON SCHEMA public TO soc_user;
```

### Step 3: Configure Environment Variables
Copy the template file to `.env`:
```powershell
# PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```
Edit `.env` and set your actual database credentials:
```ini
DATABASE_URL=postgresql://soc_user:StrongPasswordHere123!@localhost:5432/soc_monitor
SECRET_KEY=generate_a_random_32_character_string_here
ENVIRONMENT=development
```
*(Tip: Generate a strong secret with `python -c "import secrets; print(secrets.token_urlsafe(32))"`)*

### Step 4: Install Python & Node.js Dependencies
```powershell
# 1. Install Backend & Collector Python packages
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python -m pip install -r collector/requirements.txt

# 2. Install Frontend dependencies
cd frontend
npm install
cd ..
```

### Step 5: Run Database Schema Migrations
Apply all schema revisions to your clean PostgreSQL database:
```bash
python -m alembic upgrade head
```
*(Expected output: Applies migrations up to head revision `c6126f7d6e20`).*

### Step 6: Start Local Services

You can launch all platform tiers together or run each service independently using the dedicated PowerShell lifecycle scripts:

#### Option A: Unified Startup Manager
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-SOCMonitor.ps1
```

#### Option B: Dedicated Tiered Startup Scripts
For modular debugging, run each component in its own terminal:

1. **Database Inspector & Migrator:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Start-Database.ps1 -ApplyMigrations
   ```
   *Validates `.env`, checks and starts local PostgreSQL services if stopped, verifies query execution, and checks/applies Alembic migrations.*

2. **Backend API Launcher:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Start-Backend.ps1 -Reload
   ```
   *Validates Python 3.10+, checks dependencies, verifies database reachability, tests port 8000 availability, and launches FastAPI.*

3. **Frontend Dashboard Launcher:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Start-Frontend.ps1
   ```
   *Validates Node.js & npm, checks `node_modules`, inspects `NEXT_PUBLIC_API_URL`, verifies port 3000, and launches Next.js.*

4. **Collector Service (for endpoints):**
   ```powershell
   python -m uvicorn collector.app.main:app --host 0.0.0.0 --port 5000
   ```

Open your browser to: **[http://localhost:3000](http://localhost:3000)**

---

## 6. Detailed Documentation Index

For in-depth guides, visit the dedicated manuals:
- 📖 **[Service Deployment Guide (README-DEPLOYMENT.md)](README-DEPLOYMENT.md)**: Windows native, Linux native, Docker architecture, reverse proxy, PostgreSQL least-privilege roles, backup/restore, and service isolation.
- 🛡️ **[Endpoint Agent Installation & Operations (README-AGENTS.md)](README-AGENTS.md)**: Windows Service, Linux systemd, WSL, enrollment tokens, channel configuration, harmless test markers, uninstallation, and troubleshooting.
- 🤖 **[AI-Assisted Setup & Operator Runbook (README-AI-SETUP.md)](README-AI-SETUP.md)**: Step-by-step instructions for onboarding AI coding assistants safely without leaking secrets or corrupting databases.

---

## 7. Environment Variables Reference

| Variable | Required | Default / Example | Service | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | `postgresql://soc_user:pass@localhost:5432/soc_monitor` | Backend, Collector, Alembic | Async connection string for PostgreSQL storage. |
| `ENVIRONMENT` | Optional | `development` (`production` / `development`) | Backend | Toggles Swagger docs, strict CORS, and security guards. |
| `DEBUG` | Optional | `false` | Backend | Enables verbose debugging. Must be `false` in production. |
| `SECRET_KEY` | **Yes** (Prod) | Random 32-character string | Backend | Cryptographic signing key for sessions and tokens. |
| `CORS_ORIGINS` | Optional | `http://localhost:3000,http://127.0.0.1:3000` | Backend | Permitted web origins. Wildcard `*` rejected in production. |
| `COLLECTOR_PORT` | Optional | `5000` | Collector | HTTP port for agent telemetry ingestion. |
| `RATE_LIMIT_ENABLED`| Optional | `true` | Backend | Protects API endpoints from abuse. |
| `BOOTSTRAP_ADMIN_USERNAME`| Optional| `admin` | Backend | Optional initial administrator account created on startup. |
| `BOOTSTRAP_ADMIN_PASSWORD`| Optional| `StrongAdminPassword` | Backend | Initial administrator password. |

---

## 8. Network Ports & Firewall Binding Guidance

| Port | Service | Recommended Host Binding | Security & Firewall Guidance |
| :--- | :--- | :--- | :--- |
| `3000` | Next.js Dashboard | `127.0.0.1` | Bind to localhost. Expose to analysts via reverse proxy (Nginx / Caddy) with TLS. |
| `8000` | FastAPI Backend | `127.0.0.1` | Keep strictly bound to loopback. Only the frontend and local workers should access it. |
| `5000` | Collector Service | `0.0.0.0` or Host IP | **Accessible to endpoints.** Restrict via firewall to your internal management subnet or VM network adapter (e.g. VirtualBox Host-Only `192.168.56.0/24`). |
| `5432` | PostgreSQL Database| `127.0.0.1` | **Never expose to public Internet.** Bind to loopback or private Docker bridge network. |

---

## 9. Verification & Health Check Endpoints

Once services are running, verify each tier using these endpoints:

1. **Backend API Health:**
   ```bash
   curl -s http://127.0.0.1:8000/health
   # Expected: {"status":"ok","service":"soc-monitor-backend"}
   ```
2. **Backend Database Connection Health:**
   ```bash
   curl -s http://127.0.0.1:8000/health/db
   # Expected: {"status":"ok","service":"database"}
   ```
3. **Collector Ingestion Health:**
   ```bash
   curl -s http://127.0.0.1:5000/health
   # Expected: {"status":"ok","service":"soc-monitor-collector"}
   ```
4. **Dashboard HTTP Availability:**
   ```bash
   curl -s -I http://localhost:3000
   # Expected: HTTP/1.1 200 OK
   ```

---

## 10. Common Troubleshooting Runbooks

### Issue 1: `DATABASE_URL` Connection Refused
- **Symptom:** Backend logs report `asyncpg.exceptions.CannotConnectNowError` or `Connection refused`.
- **Cause:** PostgreSQL service is stopped or port 5432 is unreachable.
- **Fix:** In PowerShell, verify with `Get-Service -Name postgresql*` and run `Start-Service postgresql-x64-18`. Ensure username, password, and port in `.env` match.

### Issue 2: Special Characters in Database Password
- **Symptom:** `ValueError: invalid literal for int() with base 10` or URL parsing failures during startup.
- **Cause:** Passwords containing symbols like `@`, `:`, or `/` break standard URI parsing.
- **Fix:** URL-encode special characters in `DATABASE_URL` (e.g., replace `@` with `%40`, `:` with `%3A`, `!` with `%21`).

### Issue 3: Agent Registration Returns HTTP 401 Unauthorized
- **Symptom:** Agent logs display `Failed to register agent: 401 Unauthorized`.
- **Cause:** One-time enrollment token expired (24h lifespan) or was already consumed by another agent.
- **Fix:** In the dashboard header, open **+ Add Endpoint**, generate a fresh enrollment token, and pass it to the installer.

### Issue 4: Dashboard Shows Empty Telemetry On Fresh Clone
- **Symptom:** Charts and event tables are empty.
- **Explanation:** **This is correct and expected behavior.** A clean deployment connects to your new, empty database. Telemetry appears as soon as you install and start an agent.
- **Quick Test:** Send a test event to verify end-to-end ingestion:
  - On Windows: `eventcreate /L APPLICATION /T INFORMATION /SO "SOCMonitor" /ID 100 /D "SOCMON-TEST-EVENT-01"`
  - On Linux: `logger "SOCMON-TEST-EVENT-01: Linux telemetry test"`
  - Within 5 seconds, search for `SOCMON-TEST-EVENT-01` in `/raw-logs` or `/live-events`.

---

## 11. Security, Privacy & Compliance

- **No Remote Telemetry Leaks:** SOC Monitor operates completely on-premises or within your private VPC. No logs or telemetry are transmitted to third-party cloud services.
- **Token Hashing:** Enrollment tokens are hashed with SHA-256 upon consumption. Raw tokens are never stored in plaintext in the database.
- **Parameterized Queries:** All SQL database queries use SQLAlchemy async ORM parameterized statements to eliminate SQL injection risks.
- **Strict CORS & CSP Headers:** API responses include defensive HTTP headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`).

---

## 12. License & Contributing

- **License:** Open-source under the Apache License 2.0 (or MIT License).
- **Contributing:** Pull requests are welcome. Ensure all backend tests (`python -m pytest backend/tests/`), collector tests (`python -m pytest collector/tests/`), and frontend builds (`npm run build`) pass before submitting.
