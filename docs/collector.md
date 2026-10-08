# Collector API

The Collector serves as the sole ingestion boundary for the SOC Monitor platform.

## Architecture
- **Port**: `5000`
- **Framework**: FastAPI
- **Authentication**: `AGENT_SHARED_SECRET` via `X-Agent-Auth` headers.

## Endpoints
- `POST /api/v1/agent/register`: Agent ID generation and validation.
- `POST /api/v1/agent/heartbeat`: Liveness tracking.
- `POST /api/v1/agent/events`: High-throughput telemetry ingestion.

## Resilience
- Rejects malformed JSON payloads with HTTP 422 (Unprocessable Entity).
- Normalizes parsed envelopes and writes directly to PostgreSQL.
- Disconnected completely from the Dashboard and Rules engine to prevent ingestion blocking during heavy correlation loads.
