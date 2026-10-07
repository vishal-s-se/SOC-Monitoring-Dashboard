# Release and Implementation Checklist

This checklist reflects the repository at Phase 10C. Status values are limited to `COMPLETE`, `PARTIAL`, and `NOT IMPLEMENTED`.

| Requirement | Status | Implementation location | Validation |
|---|---|---|---|
| Project overview and component boundaries | COMPLETE | `docs/README.md`, `docs/architecture/README.md` | Documentation audit |
| PostgreSQL schema and migrations | COMPLETE | `backend/alembic/`, `docs/architecture/database.md` | `alembic check`; backend tests |
| Collector registration, heartbeat, and ingestion | COMPLETE | `collector/app/routes.py`, `collector/app/pipeline.py` | Collector tests; live `201/200/202` smoke path |
| Raw log preservation and normalization | COMPLETE | `collector/app/pipeline.py`, `backend/app/models/raw_log.py`, `event.py` | Live PostgreSQL trace; collector tests |
| Windows agent | COMPLETE | Separate `Security-Monitering-Agent` repository | Main repository consumes the existing collector contract |
| Linux agent | COMPLETE | Separate `Security-Monitering-Agent` repository | Main repository consumes the existing collector contract |
| Detection engine models and results API | COMPLETE | `backend/app/models/detection.py`, detection endpoints, engine modules | Backend detection tests |
| Seeded detection-rule catalog | COMPLETE | `backend/app/services/detection_catalog.py`, `detection_seeder.py` | Four catalog tests cover IDs, supported conditions, idempotency, and disabled-rule preservation |
| Alert lifecycle | COMPLETE | Alert endpoints, models, dashboard alert views | Backend API regression tests |
| Investigations and evidence | COMPLETE | Investigation endpoints, models, dashboard views | Backend API regression tests |
| MITRE catalog and mappings | COMPLETE | MITRE models, endpoints, dashboard | Backend API regression tests |
| Analytics and correlation models/API | COMPLETE | `backend/app/api/v1/endpoints/analytics.py`, models, dashboard | Backend regression tests |
| Dashboard pages and production build | COMPLETE | `frontend/app/`, `frontend/package.json` | `npm run build` |
| Authenticated backend API | COMPLETE | `backend/app/api/deps.py`, auth endpoint, API router | Backend regression and security changes |
| Dashboard bearer-token integration | PARTIAL | `frontend/lib/api.ts`, `frontend/hooks/useWebSocket.ts` | API client has no token injection; protected WebSocket cannot be used by default |
| WebSocket server authorization | COMPLETE | `backend/app/api/v1/endpoints/ws.py` | Backend WebSocket manager tests; live client test requires a WebSocket client |
| Security controls | PARTIAL | `backend/app/core/`, `collector/app/`, `backend/app/main.py` | Security implementation present; frontend dependency audit remains red |
| Reports and secure exports | COMPLETE | `backend/app/api/v1/endpoints/reports.py`, `docs/api.md` | Reports regression tests and filename validation |
| Retention policy and cleanup | COMPLETE | retention endpoint, models, migrations | Retention regression tests; migration check |
| System and agent health | PARTIAL | health endpoints, agent models, and endpoint agents | Real health telemetry requires running agents and readable platform sources |
| Search and filtering | COMPLETE | event, investigation, timeline, analytics, and report endpoints | Backend API regression tests |
| Native deployment scripts | COMPLETE | `scripts/start-all.ps1`, `docs/deployment.md` | PowerShell parse check; live service startup |
| TLS and certificate management | PARTIAL | `HTTPS_ENABLED` and deployment guidance | TLS termination remains external |
| CSRF protection | NOT IMPLEMENTED | Bearer-token API does not use browser cookies | Not applicable to current auth model; reassess if cookie auth is added |
| Frontend automated tests | NOT IMPLEMENTED | `frontend/package.json` has no test script | Production build passes |
| Security dependency audit | PARTIAL | `frontend/package.json`, lockfile | `npm audit --omit=dev` reports one high and one critical advisory |
| Release ignore rules | COMPLETE | `.gitignore` | `.env`, environments, caches, build artifacts, logs, and IDE files covered |

## Demonstration and screenshot checklist

Recommended presentation captures, limited to implemented dashboard screens:

1. Architecture diagram from `docs/architecture/README.md`.
2. Dashboard overview.
3. Live events.
4. Windows logs and Linux logs pages, showing their implemented query surfaces rather than claiming an included agent.
5. Firewall and network activity.
6. Authentication activity.
7. Processes.
8. Alert lifecycle.
9. Investigation detail with evidence.
10. Attack timeline.
11. MITRE ATT&CK catalog or mapping detail.
12. Host investigation.
13. IP investigation.
14. Agent health.
15. System health.
16. Reports.
17. Raw logs.

The authorized workflow for these captures is documented in [the SOC lab guide](soc-lab.md). Screens that require endpoint telemetry, an enabled detection rule, or authentication must be captured only after that prerequisite is configured.

## Phase 10C validation record

| Validation | Status | Evidence |
|---|---|---|
| Backend and collector regression suite | COMPLETE | `62 passed` |
| Frontend production build | COMPLETE | Next.js build generated 27 routes |
| Database migration consistency | COMPLETE | `alembic check` completed without pending operations |
| Dashboard route inventory | COMPLETE | All navigation targets have corresponding App Router pages; investigation detail is implemented as a dynamic route |
| Endpoint agents | COMPLETE | Separate `Security-Monitering-Agent` repository | Endpoint implementation is intentionally outside this repository |
| Seeded detection catalog | PARTIAL | Detection APIs exist; no default enabled catalog is included |
| Frontend automated test suite | NOT IMPLEMENTED | No frontend test script is defined |
| Frontend dependency audit | PARTIAL | Existing audit advisories remain documented; no unrelated dependency change was made |
| Docker validation | NOT IMPLEMENTED | Docker is explicitly outside the supported release path |

The release candidate is portfolio/demo-ready for the implemented collector, API, database, and dashboard surfaces. It is not a claim of complete endpoint-agent coverage or turnkey alert generation.

## Phase 11A validation record

| Validation | Status | Evidence |
|---|---|---|
| Shared agent core | COMPLETE | Configuration, identity, transport, retry, TLS settings, durable bounded spool, and runner tests |
| Endpoint-agent ownership | COMPLETE | Main repository references the separate authoritative agent repository | No duplicate implementation remains here |
| Collector protocol integration | COMPLETE | Registration, heartbeat, and event payloads match existing collector schemas and authentication |
| Agent/backend/collector regression | COMPLETE | `73 passed` |
| Migration check | COMPLETE | No new upgrade operations detected |
| Frontend build | COMPLETE | Next.js build generated 27 routes |
| Dependency audit | PARTIAL | Existing one high and one critical frontend advisory; remediation requires a breaking Next.js upgrade |

Phase 11A adds endpoint collection without changing the collector, backend, or dashboard protocol. Full OS-source coverage remains dependent on host permissions and installed logging facilities.

## Release gate

Do not label a release complete while any `PARTIAL` or `NOT IMPLEMENTED` item is a release requirement. In particular, install endpoint agents before claiming Windows/Linux telemetry, seed and validate detection rules before claiming live alert generation, integrate dashboard authentication before claiming protected WebSocket operation, and resolve the frontend dependency audit.

## Final validation commands

```powershell
$env:PYTHONPATH=(Get-Location).Path
& .\backend\venv\Scripts\python.exe -m pytest backend/tests collector/tests -q
& .\backend\venv\Scripts\python.exe -m alembic -c alembic.ini check
Push-Location frontend
npm run build
npm audit --omit=dev
Pop-Location
git diff --check
git status
```
