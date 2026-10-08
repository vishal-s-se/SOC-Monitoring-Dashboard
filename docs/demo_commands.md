# Demo Command Sheet (Copy-Paste)

**1. Backend**
```powershell
$env:DATABASE_URL="postgresql+asyncpg://<USER>:<PASSWORD>@localhost:5432/soc_monitor"
$env:AGENT_SHARED_SECRET="<YOUR_SECRET>"
$env:ENVIRONMENT="development"
.env\Scripts\python.exe -m uvicorn backend.app.main:app --port 8000
```

**2. Collector**
```powershell
$env:DATABASE_URL="postgresql+asyncpg://<USER>:<PASSWORD>@localhost:5432/soc_monitor"
$env:AGENT_SHARED_SECRET="<YOUR_SECRET>"
.env\Scripts\python.exe -m uvicorn collector.app.main:app --port 5000
```

**3. Frontend**
```powershell
npm run dev
```

**4. Windows Agent**
```powershell
$env:PYTHONPATH="src"
$env:SOC_AGENT_AUTH_TOKEN="<YOUR_SECRET>"
python src\main.py -c agent.yml
```

**5. Trigger Event**
```powershell
Write-EventLog -LogName Application -Source "Application" -EventID 4624 -EntryType Information -Message "Demo Alert"
```
