# Start All SOC Monitor Services
$projectRoot = Split-Path -Parent $PSScriptRoot

# Ensure Python and Node are in PATH
$env:Path = "$env:LOCALAPPDATA\Programs\Python\Python312;$env:LOCALAPPDATA\Programs\Python\Python312\Scripts;$env:LOCALAPPDATA\Programs\nodejs;$env:Path"

Write-Host "Starting SOC Monitor Platform Services..." -ForegroundColor Cyan

# 1. Start Backend API (Port 8000)
Write-Host "Starting Backend API on http://localhost:8000..." -ForegroundColor Green
Start-Process powershell -WorkingDirectory "$projectRoot" -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'SOC Monitor - Backend (Port 8000)'; & '.\backend\venv\Scripts\uvicorn.exe' backend.app.main:app --reload --port 8000"

# 2. Start Collector API (Port 5000)
Write-Host "Starting Collector on http://localhost:5000..." -ForegroundColor Green
Start-Process powershell -WorkingDirectory "$projectRoot\collector" -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'SOC Monitor - Collector (Port 5000)'; & '$projectRoot\backend\venv\Scripts\uvicorn.exe' app.main:app --reload --port 5000"

# 3. Start Frontend Dashboard (Port 3000)
Write-Host "Starting Frontend Dashboard on http://localhost:3000..." -ForegroundColor Green
Start-Process powershell -WorkingDirectory "$projectRoot\frontend" -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'SOC Monitor - Frontend (Port 3000)'; npm run dev"

Write-Host "`nAll services have been launched in separate terminal windows." -ForegroundColor Yellow
Write-Host "Frontend:   http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend:    http://localhost:8000 (Health: http://localhost:8000/health)" -ForegroundColor Cyan
Write-Host "Collector:  http://localhost:5000 (Health: http://localhost:5000/health)" -ForegroundColor Cyan
