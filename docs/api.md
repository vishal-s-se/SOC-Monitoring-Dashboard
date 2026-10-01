# API Reference

Base URL: `http://localhost:8000/api/v1`.

All groups except `/auth` and the WebSocket route use the backend bearer-token dependency. The shared method policy requires an active user, permits reads to viewers, permits ordinary writes to analysts, and reserves retention writes and MITRE seeding for administrators. Report reads require analyst access.

## Authentication

- `POST /auth/login` accepts `username` and `password` and returns a bearer token.
- `POST /auth/logout` revokes the current token in the backend process.
- `GET /auth/me` returns the active user.

Authentication errors intentionally use generic messages. Login attempts are rate limited and repeated failures are temporarily locked.

## Telemetry and inventory

- `GET /events/`, `GET /events/{id}`
- `GET /raw_logs/`, `GET /raw_logs/{id}`
- `GET /hosts/`, `GET /hosts/{id}`
- `GET /agents/`, `GET /agents/{id}`
- `GET /detections/rules`, `GET /detections/rules/{id}`
- `GET /detections/results`, `GET /detections/results/{id}`

List endpoints use bounded pagination where defined by their schemas. Query and path values are validated before database access.

## Alerts and investigations

- `GET /alerts/`, `GET /alerts/{alert_id}`
- `POST /alerts/{alert_id}/acknowledge`
- `POST /alerts/{alert_id}/resolve`
- `GET /alerts/{alert_id}/context`
- `POST /investigations/`
- `GET /investigations/`, `GET /investigations/{id}`
- `PATCH /investigations/{id}`
- `POST /investigations/{id}/status`
- `POST /investigations/{id}/evidence`
- `DELETE /investigations/{id}/evidence/{evidence_id}`
- `POST /investigations/{id}/notes`
- `GET /investigations/{id}/context`
- `GET /investigations/{id}/summary`
- `GET /investigations/{id}/correlated-events`
- `GET /investigations/{investigation_id}/intelligence`

## Investigation views

- `GET /ip-investigation/{ip}`
- `GET /ip-investigation/{ip}/events`
- `GET /ip-investigation/{ip}/alerts`
- `GET /host-investigation/{host_id}`
- `GET /host-investigation/{host_id}/events`
- `GET /host-investigation/{host_id}/alerts`
- `GET /user-context/{username}`
- `GET /user-context/{username}/events`
- `GET /events/{event_id}/context`
- `GET /attack-timeline/`

## MITRE ATT&CK

- `GET /mitre/tactics`
- `GET /mitre/techniques`
- `GET /mitre/techniques/{technique_id}`
- `GET /mitre/mappings`
- `POST /mitre/mappings`
- `DELETE /mitre/mappings/{mapping_id}`
- `POST /mitre/seed` (administrator write access)

A mapping is an application record, not proof that an event represents a confirmed attack. Unsupported techniques must not be presented as confirmed findings.

## Analytics and health

- `GET /analytics/baselines`
- `GET /analytics/baselines/{baseline_id}`
- `GET /analytics/deviations`
- `GET /analytics/entities/{entity_type}/{entity_id}/deviations`
- `GET /analytics/correlations`
- `GET /analytics/deviations/{deviation_id}/correlations`
- `GET /analytics/overview`
- `GET /analytics/timeseries`
- `GET /analytics/detections`
- `GET /analytics/telemetry`
- `GET /analytics/alerts`
- `GET /analytics/investigations`
- `GET /analytics/agents`
- `GET /analytics/mitre`
- `GET /health/overview`
- `GET /health/services`
- `GET /health/queue`

Unauthenticated operational checks outside `/api/v1` are `GET /health`, `GET /health/db`, and `GET /`.

## Reports and retention

Reports:

- `GET /reports/daily-summary`
- `GET /reports/host/{host_id}`
- `GET /reports/ip/{ip}`
- `GET /reports/timeline`
- `GET /reports/alert/{alert_id}`
- `GET /reports/authentication`
- `GET /reports/firewall`

Reports support the implemented query filters and JSON/CSV output where specified by the endpoint. CSV filenames are sanitized and responses are marked non-cacheable.

Retention:

- `GET /retention/policy`
- `PUT /retention/policy` (administrator)
- `POST /retention/dry-run` (authenticated)
- `POST /retention/cleanup` (administrator)
- `GET /retention/history`

## Collector API

The collector uses port `5000`, not the backend API prefix:

- `GET /health`
- `POST /api/v1/agent/register`
- `POST /api/v1/agent/heartbeat`
- `POST /api/v1/agent/events`

The three agent routes require `X-Agent-Auth: YOUR_AGENT_TOKEN`. Payloads are Pydantic-validated and the collector rejects oversized request bodies. Lightweight Windows and Linux endpoint clients are documented in [Endpoint Agents](agents.md); their available telemetry remains platform-dependent.

## WebSocket

- `WS /api/v1/ws/`

The backend validates a bearer token supplied as a `token` query parameter or Authorization header, checks the active user, limits connections and message size, and accepts only the supported ping/subscribe message shapes. Query-string tokens can appear in proxy logs; prefer an Authorization-capable client and TLS in deployment. The current dashboard hook does not yet supply the token.
