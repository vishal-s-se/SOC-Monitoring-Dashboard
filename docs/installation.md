# Installation & Running

## Requirements
- **OS**: Windows 10/11 (for Windows Agent & Platform Host)
- **Python**: 3.12+
- **Node.js**: 18+
- **Database**: PostgreSQL 14+
- **Playwright**: Chromium browser binaries

## Database Setup
1. Install PostgreSQL.
2. Create the databases:
   ```sql
   CREATE DATABASE soc_monitor;
   CREATE DATABASE soc_monitor_test;
   ```
3. Initialize schemas via Alembic:
   ```powershell
   cd backend
   $env:DATABASE_URL="postgresql+asyncpg://<USER>:<PASSWORD>@localhost:5432/soc_monitor"
   alembic upgrade head
   ```

## Running the Platform
Open separate terminals for each component.

### 1. Backend API (Port 8000)
```powershell
cd backend
$env:DATABASE_URL="postgresql+asyncpg://<USER>:<PASSWORD>@localhost:5432/soc_monitor"
$env:AGENT_SHARED_SECRET="<YOUR_SECRET>"
$env:ENVIRONMENT="development"
.env\Scripts\python.exe -m uvicorn backend.app.main:app --port 8000
```

### 2. Collector API (Port 5000)
```powershell
cd collector
$env:DATABASE_URL="postgresql+asyncpg://<USER>:<PASSWORD>@localhost:5432/soc_monitor"
$env:AGENT_SHARED_SECRET="<YOUR_SECRET>"
.env\Scripts\python.exe -m uvicorn collector.app.main:app --port 5000
```

### 3. Frontend Dashboard (Port 3000)
```powershell
cd frontend
npm install
npm run dev
```

### 4. Windows Agent
*(Located in the `SOC Monitering Agent` repository)*
```powershell
$env:PYTHONPATH="src"
$env:SOC_AGENT_AUTH_TOKEN="<YOUR_SECRET>"
python src\main.py -c agent.yml
```
