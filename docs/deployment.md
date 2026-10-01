# Installation and Deployment

This is a native local-host deployment. Docker is not required by the repository.

## Prerequisites

- Windows PowerShell or an equivalent shell.
- Python 3.11 or newer.
- Node.js compatible with the installed Next.js version.
- PostgreSQL listening on port `5432`.
- A PostgreSQL database and credentials supplied through `DATABASE_URL`.
- No Redis service is required by the current request path; `REDIS_URL` is retained as configuration for planned queue work.

## Configuration

Copy `.env.example` to `.env` and replace placeholders. Never commit `.env`.

### Backend values

| Name | Required | Purpose | Safe example |
|---|---|---|---|
| `ENVIRONMENT` | Optional | Environment name; `production` enables stricter checks. | `development` |
| `PROJECT_NAME` | Optional | API application name. | `SOC Monitor` |
| `VERSION` | Optional | Application version. | `0.1.0` |
| `API_V1_STR` | Optional | API prefix. | `/api/v1` |
| `REDIS_URL` | Optional | Redis configuration value; not required by the current ingestion path. | `redis://localhost:6379/0` |
| `DATABASE_URL` | Required | PostgreSQL connection URL. | `postgresql://YOUR_DB_USER:YOUR_DATABASE_PASSWORD@localhost:5432/soc_monitor` |
| `SECRET_KEY` | Required in production | JWT signing key. Development generates a process-local random key when omitted. | `YOUR_SECRET` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Optional | JWT lifetime. | `60` |
| `CORS_ORIGINS` | Optional | Comma-separated explicit browser origins. | `http://localhost:3000` |
| `DEBUG` | Optional | Debug flag; must be false in production. | `false` |
| `HTTPS_ENABLED` | Optional | Deployment readiness flag. TLS termination is external. | `false` |
| `MAX_REQUEST_BODY_BYTES` | Optional | Backend request-size limit. | `1048576` |
| `RATE_LIMIT_ENABLED` | Optional | Enables API and login throttling. | `true` |
| `API_RATE_LIMIT_PER_MINUTE` | Optional | General API limit per client/path bucket. | `300` |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | Optional | Login request limit. | `5` |
| `EXPENSIVE_RATE_LIMIT_PER_MINUTE` | Optional | Reports and expensive investigation limit. | `30` |
| `WS_MAX_CONNECTIONS` | Optional | Maximum active WebSocket connections. | `50` |
| `WS_MAX_MESSAGE_BYTES` | Optional | Maximum client WebSocket message size. | `4096` |
| `BOOTSTRAP_ADMIN_USERNAME` | Optional | Bootstrap administrator username when supported by startup configuration. | `admin` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Optional | Bootstrap administrator password. Supply through the environment only. | `YOUR_ADMIN_PASSWORD` |
| `BOOTSTRAP_ADMIN_EMAIL` | Optional | Bootstrap administrator email. | `admin@example.invalid` |

### Collector values

| Name | Required | Purpose | Safe example |
|---|---|---|---|
| `COLLECTOR_PORT` | Optional | Collector listen port. | `5000` |
| `AGENT_SHARED_SECRET` | Required for agents | Shared header credential for agent ingestion. If omitted, a random process-local value is generated and external agents cannot authenticate reliably. | `YOUR_AGENT_TOKEN` |
| `DATABASE_URL` | Required | PostgreSQL URL; converted to an async driver URL by the collector. | `postgresql://YOUR_DB_USER:YOUR_DATABASE_PASSWORD@localhost:5432/soc_monitor` |
| `PROJECT_NAME` | Optional | Collector application name. | `SOC Collector` |

### Frontend values

- `NEXT_PUBLIC_API_URL` optionally overrides the API base URL; default is `http://localhost:8000/api/v1`.
- `NEXT_PUBLIC_WS_URL` optionally overrides the WebSocket URL; default is `ws://localhost:8000/api/v1/ws/`.

The current frontend WebSocket hook does not attach a bearer token. In an authenticated deployment, the dashboard real-time connection therefore requires a follow-up frontend authentication integration.

## Database setup

1. Create the PostgreSQL database and role outside the repository.
2. Set `DATABASE_URL` in `.env`.
3. From the repository root, activate `backend/venv` and run:

```powershell
& .\backend\venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
& .\backend\venv\Scripts\python.exe -m alembic -c alembic.ini check
```

`check` should report no new upgrade operations.

## Install dependencies

```powershell
& .\backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt -r collector\requirements.txt
Push-Location frontend
npm install
Pop-Location
```

## Start services

The supported all-services launcher is:

```powershell
.\scripts\start-all.ps1
```

For separate terminals:

```powershell
& .\backend\venv\Scripts\uvicorn.exe backend.app.main:app --host 127.0.0.1 --port 8000
Push-Location collector
& ..\backend\venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 5000
Pop-Location
Push-Location frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
Pop-Location
```

## Health verification

```powershell
Invoke-WebRequest http://127.0.0.1:8000/health
Invoke-WebRequest http://127.0.0.1:8000/health/db
Invoke-WebRequest http://127.0.0.1:5000/health
Invoke-WebRequest http://127.0.0.1:3000
```

Expected HTTP status is `200` for each endpoint. The backend database health check proves database connectivity; collector health alone does not prove collector database connectivity.

## Security and deployment controls

- Keep `.env`, credentials, certificates, logs, virtual environments, `node_modules`, `.next`, and caches out of source control.
- Set a unique `SECRET_KEY`, database credentials, and `AGENT_SHARED_SECRET` outside the repository.
- Use `ENVIRONMENT=production`, `DEBUG=false`, explicit CORS origins, and TLS at the reverse proxy or service boundary.
- Expose only ports required by the deployment: `8000` for backend, `5000` for collector, `3000` for dashboard, and `5432` only to trusted application hosts.
- Restrict PostgreSQL privileges to the application database role. Back up PostgreSQL before retention cleanup.
- Rotate the collector shared secret and JWT signing key through a controlled deployment process. In-process token revocation is lost on backend restart.

## Troubleshooting

- **Backend cannot import `backend`:** start it from the repository root with `backend.app.main:app`.
- **Collector cannot import `collector`:** start it from the `collector` directory with `app.main:app`.
- **Database authentication failed:** verify the effective `.env` path, `DATABASE_URL`, role, password, and database name.
- **Collector returns `401`:** send `X-Agent-Auth: YOUR_AGENT_TOKEN`; the value must match `AGENT_SHARED_SECRET`.
- **Dashboard API is unavailable:** set `NEXT_PUBLIC_API_URL` before building or running Next.js.
- **Dashboard real-time status is disconnected:** verify the WebSocket URL and complete the frontend bearer-token integration required by the protected backend WebSocket endpoint.
