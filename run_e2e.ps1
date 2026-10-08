$ErrorActionPreference = "Stop"

Write-Host "Starting E2E Tests Environment..."

$env:DATABASE_URL="postgresql+asyncpg://postgres:Vishal%402006@localhost:5432/soc_monitor_test"
$env:AGENT_SHARED_SECRET="changeme_secret"
$env:ENVIRONMENT="development"
$env:BOOTSTRAP_ADMIN_USERNAME="admin"
$env:BOOTSTRAP_ADMIN_PASSWORD="changeme123"

Write-Host "Resetting DB..."
& .\backend\venv\Scripts\python.exe -c "
import asyncio
from backend.app.db.base_class import Base
from sqlalchemy.ext.asyncio import create_async_engine
import os
url = os.getenv('DATABASE_URL')
engine = create_async_engine(url)
async def reset():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(reset())
"

Write-Host "Starting Backend on 8000..."
$backendProcess = Start-Process -NoNewWindow -PassThru -FilePath ".\backend\venv\Scripts\python.exe" -ArgumentList "-m uvicorn backend.app.main:app --port 8000"

Write-Host "Starting Collector on 5000..."
$collectorProcess = Start-Process -NoNewWindow -PassThru -FilePath ".\backend\venv\Scripts\python.exe" -ArgumentList "-m uvicorn collector.app.main:app --port 5000"

Write-Host "Waiting for services to be ready..."
Start-Sleep -Seconds 15

Write-Host "Seeding test data & generating token..."
& .\backend\venv\Scripts\python.exe e2e_seed.py
Start-Sleep -Seconds 2

$env:NEXT_PUBLIC_E2E_TOKEN = Get-Content e2e_token.txt

Write-Host "Starting Frontend on 3000..."
Set-Location .\frontend
$frontendProcess = Start-Process -NoNewWindow -PassThru -FilePath "npm" -ArgumentList "run dev"
Set-Location ..

Write-Host "Waiting for frontend..."
Start-Sleep -Seconds 10

Write-Host "Running Playwright tests..."
Set-Location .\frontend
npx playwright test
$testExitCode = $LASTEXITCODE
Set-Location ..

Write-Host "Stopping services..."
Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $collectorProcess.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue

Exit $testExitCode
