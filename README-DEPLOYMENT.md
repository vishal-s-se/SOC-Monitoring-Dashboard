# SOC Monitor — Comprehensive Service Deployment & Infrastructure Guide

This guide covers complete, production-grade installation, configuration, database provisioning, and operational management of SOC Monitor platform services across Windows, Linux, and containerized architectures.

---

## Architecture & Service Topology

SOC Monitor consists of three primary platform tiers backed by a relational database:
1. **PostgreSQL Database (Port 5432):** Shared asynchronous storage for raw logs, normalized events, alerts, agent lifecycle records, and investigations.
2. **Collector Service (Port 5000):** Lightweight FastAPI daemon receiving telemetry from endpoint agents, enforcing SHA-256 token authentication, and populating the pipeline.
3. **Backend API (Port 8000):** FastAPI engine executing the detection catalog, behavioral correlation state machines, alert lifecycle workflows, and WebSocket broadcasting.
4. **Analyst Dashboard (Port 3000):** Next.js / React interactive web interface.

---

## 1. Prerequisites & Environment Matrix

| Requirement | Windows Native | Linux Native (Debian / Ubuntu / Kali) | Containerized (Docker) |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 10/11 / Server 2019+ | Debian 11+, Ubuntu 20.04+, Kali 2023+ | Linux or Windows with Docker Desktop |
| **Python** | 3.10 – 3.12 (64-bit) | 3.10 – 3.12 (python3-venv, python3-pip) | Packaged in container image |
| **Node.js & npm** | Node.js 18.17+ LTS, npm 9+ | Node.js 18.17+ LTS, npm 9+ | Node 20 LTS Alpine image |
| **PostgreSQL** | PostgreSQL 14 – 18 (x64) | PostgreSQL 14 – 16 (apt install) | PostgreSQL 16 Alpine container |
| **Terminal / Shell** | PowerShell 5.1+ or PowerShell 7 | Bash / Zsh | Docker CLI & Compose |

---

## 2. Database Provisioning & Least-Privilege Setup

**CRITICAL RULE:** Every new deployment must initialize its own independent PostgreSQL database. **Never connect to or reuse external developer database URLs.**

### Step-by-Step PostgreSQL Provisioning
Open `psql` as a PostgreSQL administrator:

```bash
# On Linux
sudo -u postgres psql

# On Windows (from cmd/PowerShell with psql in PATH)
psql -U postgres
```

Execute the following security-hardened provisioning commands:
```sql
-- 1. Create a dedicated application user with an encrypted password
CREATE USER soc_user WITH ENCRYPTED PASSWORD 'ReplaceWithYourSecurePassword123!';

-- 2. Create the dedicated database owned by this user
CREATE DATABASE soc_monitor OWNER soc_user;

-- 3. Connect to the newly created database
\c soc_monitor

-- 4. Grant schema permissions to the dedicated role
GRANT ALL PRIVILEGES ON DATABASE soc_monitor TO soc_user;
GRANT ALL ON SCHEMA public TO soc_user;

-- 5. Set defensive defaults
ALTER ROLE soc_user SET client_encoding TO 'utf8';
ALTER ROLE soc_user SET timezone TO 'UTC';
```

### Formatting the DATABASE_URL
Both the Backend API and Collector service use asynchronous SQLAlchemy (`asyncpg`). The connection string format is:
```ini
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname>
```
*Note: Both services automatically convert `postgresql://` to `postgresql+asyncpg://`.*

#### Handling Special Characters in Passwords
If your database password contains characters such as `@`, `:`, `/`, `?`, or `#`, you **must URL-encode them** to avoid connection string parser errors:
- `@` &rarr; `%40`
- `:` &rarr; `%3A`
- `/` &rarr; `%2F`
- `!` &rarr; `%21`
- `#` &rarr; `%23`
- `$` &rarr; `%24`

*Example:* If the password is `P@ssword!`, the connection string is:
`postgresql://soc_user:P%40ssword%21@localhost:5432/soc_monitor`

---

## 3. Option A: Windows Native Deployment

### Step 1: Clone Repository & Configure Environment
```powershell
git clone https://github.com/<your-org>/soc-monitor.git
cd soc-monitor

# Copy environment template
Copy-Item .env.example .env
```
Edit `.env` using Notepad or your editor, entering your actual `DATABASE_URL` and a unique `SECRET_KEY`.

### Step 2: Install Python & Node Dependencies
Open PowerShell:
```powershell
# Upgrade pip and install Python requirements
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python -m pip install -r collector/requirements.txt

# Install Next.js frontend dependencies
cd frontend
npm install
cd ..
```

### Step 3: Apply Database Migrations
Run Alembic from the repository root:
```powershell
python -m alembic upgrade head
```
*(Verify output indicates migration up to head `c6126f7d6e20`).*

### Step 4: Launching All Services

#### Option A: Unified Startup Script
You can run the validated automated startup manager:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-SOCMonitor.ps1
```
This script validates ports, checks PostgreSQL status, and opens labelled windows for Backend, Collector, and Frontend.

#### Option B: Modular Tiered Startup Scripts
For fine-grained control or troubleshooting:
- **1. Database Verification & Migrations:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\Start-Database.ps1 -ApplyMigrations
  ```
- **2. Backend API Launcher:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\Start-Backend.ps1 -Reload
  ```
- **3. Frontend Dashboard Launcher:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\Start-Frontend.ps1
  ```
- **4. Collector Service:**
  ```powershell
  python -m uvicorn collector.app.main:app --host 0.0.0.0 --port 5000
  ```

#### Option C: Manual Terminal Launch
- **Terminal 1 (Backend API):**
  ```powershell
  $env:PYTHONPATH = (Get-Location).Path
  python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
  ```
- **Terminal 2 (Collector):**
  ```powershell
  $env:PYTHONPATH = (Get-Location).Path
  python -m uvicorn collector.app.main:app --host 0.0.0.0 --port 5000
  ```
- **Terminal 3 (Frontend):**
  ```powershell
  cd frontend
  npm run dev
  ```

---

## 4. Option B: Linux Native Deployment (Debian / Ubuntu / Kali)

### Step 1: Install System Packages
```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv postgresql postgresql-contrib curl git
```

Install Node.js (v20 LTS recommended):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 2: Setup Python Virtual Environment
```bash
cd /opt
sudo git clone https://github.com/<your-org>/soc-monitor.git
sudo chown -R $USER:$USER soc-monitor
cd soc-monitor

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install requirements
pip install --upgrade pip
pip install -r backend/requirements.txt
pip install -r collector/requirements.txt
```

### Step 3: Configure Environment & Database
```bash
cp .env.example .env
chmod 600 .env  # Restrict read permissions
```
Edit `.env` with your secure credentials, then run database migrations:
```bash
python -m alembic upgrade head
```

### Step 4: Build and Prepare Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

### Step 5: Configure systemd Services
For background production execution, create three dedicated systemd units:

#### 1. Backend Service (`/etc/systemd/system/soc-backend.service`)
```ini
[Unit]
Description=SOC Monitor Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=socuser
WorkingDirectory=/opt/soc-monitor
EnvironmentFile=/opt/soc-monitor/.env
Environment="PYTHONPATH=/opt/soc-monitor"
ExecStart=/opt/soc-monitor/venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### 2. Collector Service (`/etc/systemd/system/soc-collector.service`)
```ini
[Unit]
Description=SOC Monitor Telemetry Collector
After=network.target postgresql.service

[Service]
Type=simple
User=socuser
WorkingDirectory=/opt/soc-monitor
EnvironmentFile=/opt/soc-monitor/.env
Environment="PYTHONPATH=/opt/soc-monitor"
ExecStart=/opt/soc-monitor/venv/bin/python -m uvicorn collector.app.main:app --host 0.0.0.0 --port 5000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### 3. Frontend Service (`/etc/systemd/system/soc-frontend.service`)
```ini
[Unit]
Description=SOC Monitor Next.js Frontend
After=network.target soc-backend.service

[Service]
Type=simple
User=socuser
WorkingDirectory=/opt/soc-monitor/frontend
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start all services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now soc-backend.service soc-collector.service soc-frontend.service
```

---

## 5. Option C: Containerized Architecture (Docker & Docker Compose Blueprint)

For teams containerizing SOC Monitor, follow this verified architecture:

### Container Topology & Networking
- **Database (`postgres:16-alpine`):** Isolated on internal bridge network `soc-internal`. Data stored on named volume `soc_db_data`.
- **Backend API:** Connects via internal service name `postgresql://soc_user:password@db:5432/soc_monitor`.
- **Collector:** Exposes port `5000` to the host/LAN so remote agents can deliver telemetry.
- **Frontend Dashboard:** Exposes port `3000` to the host.

### Sample `docker-compose.yml` Blueprint
```yaml
version: '3.8'

networks:
  soc-internal:
    driver: bridge

volumes:
  soc_db_data:

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-soc_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change_this_password}
      POSTGRES_DB: ${POSTGRES_DB:-soc_monitor}
    volumes:
      - soc_db_data:/var/lib/postgresql/data
    networks:
      - soc-internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-soc_user} -d ${POSTGRES_DB:-soc_monitor}"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-soc_user}:${POSTGRES_PASSWORD:-change_this_password}@db:5432/${POSTGRES_DB:-soc_monitor}
      PYTHONPATH: /app
    networks:
      - soc-internal
    command: >
      sh -c "python -m alembic upgrade head &&
             python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"

  collector:
    build:
      context: .
      dockerfile: docker/Dockerfile.collector
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-soc_user}:${POSTGRES_PASSWORD:-change_this_password}@db:5432/${POSTGRES_DB:-soc_monitor}
      PYTHONPATH: /app
    ports:
      - "5000:5000"
    networks:
      - soc-internal
    command: python -m uvicorn collector.app.main:app --host 0.0.0.0 --port 5000

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "3000:3000"
    networks:
      - soc-internal
```

*Note on Host-to-Container Networking:* Inside a container, `localhost` refers to the container itself. Never point services or agent configurations inside containers to `127.0.0.1` when referencing other containers. Use Compose service names (`db`, `backend`).

---

## 6. Reverse Proxy & TLS Hardening (Nginx Blueprint)

In enterprise deployments, front the Next.js dashboard and APIs with an Nginx reverse proxy providing TLS termination:

```nginx
server {
    listen 443 ssl http2;
    server_name soc.yourdomain.internal;

    ssl_certificate /etc/ssl/certs/soc-monitor.crt;
    ssl_certificate_key /etc/ssl/private/soc-monitor.key;

    # Analyst Dashboard
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API & WebSockets
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 7. Database Backup, Restore, and Maintenance

### Creating Backups (pg_dump)
Always take a snapshot before running upgrades or migrations:
```bash
# Backup schema and data to compressed archive
pg_dump -U soc_user -h localhost -Fc soc_monitor > soc_monitor_backup_$(date +%Y%m%d_%H%M%S).dump
```

### Restoring from Backup
```bash
# Restore to a clean database
pg_restore -U soc_user -h localhost -d soc_monitor -c soc_monitor_backup_YYYYMMDD_HHMMSS.dump
```

### Safe Upgrades & Rollbacks
1. Stop running Collector and Backend instances: `.\scripts\stop-all.ps1`
2. Perform a backup: `pg_dump ...`
3. Pull the latest code updates: `git pull`
4. Apply any new Alembic schema migrations: `python -m alembic upgrade head`
5. Rebuild frontend if assets changed: `cd frontend && npm run build`
6. Restart services: `.\scripts\Start-SOCMonitor.ps1`
