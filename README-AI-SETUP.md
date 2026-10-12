# SOC Monitor — AI-Assisted Implementation, Deployment & Operator Runbook

This guide is specifically designed for developers and operators pairing with AI coding assistants (such as Claude, ChatGPT, Gemini, or Antigravity) to deploy, extend, or troubleshoot SOC Monitor safely.

---

## 1. Ground Rules for AI Coding Assistants

When working with an AI assistant on SOC Monitor, provide these strict non-negotiable rules to ensure system integrity, security, and reproducibility:

```
[MANDATORY AI ASSISTANT CONSTRAINTS]
1. ZERO-ASSUMPTION POLICY: Never guess repository paths, port allocations, or database models. Always inspect the actual local repository files first.
2. DATABASE INTEGRITY: NEVER drop, truncate, wipe, or recreate the user's PostgreSQL database tables. Historical telemetry and investigation records must be preserved.
3. AUTHENTIC TELEMETRY ONLY: Never fabricate, hardcode, or randomly mock telemetry counts, events, or detection metrics. All data must derive from authentic database queries or actual agents.
4. CREDENTIAL PRIVACY: Never print, request, echo, or persist real database passwords, JWT tokens, or enrollment tokens. Always use placeholders (e.g. <DB_PASSWORD>).
5. BOUNDED EVENT QUERIES: Always bound log queries (e.g. -n 50, -n 200, or -Tail 30) to prevent timeouts or memory starvation on multi-gigabyte log streams.
6. ATOMIC COMMITS & NO AUTO-PUSH: Run all test suites before committing locally. Never execute git push unless explicitly instructed by the user.
```

---

## 2. Copyable Master Prompt for AI Assistants

Copy and paste this prompt when starting a new session with an AI coding assistant on a fresh clone of SOC Monitor:

```markdown
You are an expert full-stack cybersecurity engineer assisting with SOC Monitor.

Before making any changes or proposing commands:
1. Inspect the local repository structure, active branch, and package manifests (backend/requirements.txt, collector/requirements.txt, frontend/package.json).
2. Check .env and ensure DATABASE_URL points to my own local PostgreSQL instance. Do not expose or guess credentials.
3. Check if Alembic migrations are up to date by running: python -m alembic current.
4. Verify whether ports 3000, 5000, 8000, and 5432 are listening before launching services.
5. If running tests, execute:
   - python -m pytest collector/tests/ -v
   - python -m pytest backend/tests/ -v
   - npm run build (inside frontend)
6. Adhere strictly to the data safety rules: no mock data, no database wipes, and always mask secrets.

Please begin by auditing the current repository state and reporting the findings.
```

---

## 3. Operator Post-Installation Checklist

After installing SOC Monitor, complete this step-by-step verification checklist:

### Stage 1: Environment & Infrastructure Verification
- [ ] **Dedicated PostgreSQL Database:** Created `soc_monitor` database owned by a dedicated user (e.g., `soc_user`).
- [ ] **Environment File Configured:** Created `.env` from `.env.example` with valid `DATABASE_URL` and a random 32-character `SECRET_KEY`.
- [ ] **Database Migrations Applied:** Executed `python -m alembic upgrade head` without errors.
- [ ] **Services Online:**
  - Backend API: `curl http://127.0.0.1:8000/health` returns `{"status":"ok"}`.
  - Collector Service: `curl http://127.0.0.1:5000/health` returns `{"status":"ok"}`.
  - Dashboard: Browser accesses `http://localhost:3000` with status indicator green.

### Stage 2: Initial Dashboard State (Empty by Design)
- [ ] **Verify Clean Baseline:** The dashboard will initially show 0 events and 0 active agents. **This is expected and confirms no developer test data was leaked into your deployment.**

### Stage 3: Endpoint Agent Onboarding
- [ ] **Generate Token:** Clicked **+ Add Endpoint** in the dashboard and selected target OS.
- [ ] **Install Agent:** Executed installer script on endpoint host (Windows or Linux/Kali VM).
- [ ] **Agent Listed:** Navigated to `/agents` in dashboard and verified status changed to `ONLINE`.

### Stage 4: End-to-End Pipeline Verification
- [ ] **Send Harmless Test Marker:**
  - On Windows: `eventcreate /L APPLICATION /T INFORMATION /SO "SOCMonitor" /ID 100 /D "SOCMON-AI-TEST-01"`
  - On Linux: `logger "SOCMON-AI-TEST-01: Verification event"`
- [ ] **Search Marker:** Searched for `SOCMON-AI-TEST-01` in the dashboard search bar.
- [ ] **Inspect Raw Payload:** Clicked on the event in `/raw-logs` to confirm the Raw Log Evidence modal renders cleanly with metadata.

---

## 4. Safe Diagnostic Data Sharing

When asking an AI assistant to debug an issue, follow these redacting guidelines:

### What is SAFE to Share
✅ Python exception stack traces and line numbers.  
✅ Exit codes and CLI error messages (e.g. `syntax error near unexpected token`).  
✅ Sanitized log excerpts with placeholders.  
✅ Output of `python -m alembic current` or `git status`.  
✅ Network reachability test results (e.g. `HTTP 200` vs `HTTP 401`).  

### What MUST ALWAYS be REDACTED
❌ Real database passwords, hostnames, or raw connection strings in `DATABASE_URL`.  
❌ One-time enrollment tokens (`AGENTAUTHTOKEN`).  
❌ Internal network IP addresses or private VPN endpoints if sensitive.  
❌ Production usernames, domain names, or private certificate keys.  
