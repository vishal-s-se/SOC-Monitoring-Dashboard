# SOC Collector

The SOC Collector is an independent service that acts as the only endpoint-facing component of the SOC Monitoring architecture. It is responsible for receiving registration, heartbeat, and raw event data from endpoint agents (Windows and Linux).

## Architecture
- **Port:** 5000 (Development)
- **Role:** Intermediary between endpoint agents and the internal Phase 4 event processing pipeline.
- **Dependencies:** Uses the existing Phase 2 database models (PostgreSQL) for storing raw events and agent state.

Endpoint agents must *never* communicate directly with the database, dashboard, or backend.

## Endpoints

### `GET /health`
Collector health check. Indicates if the collector is running and capable of processing requests.

### `POST /api/v1/agent/register`
Idempotent agent registration. Associates an agent with a host in the database.
- **Requires Auth:** Yes (`X-Agent-Auth` header)
- **Payload:** `agent_id`, `hostname`, `operating_system`, `agent_version`, `ip_address` (optional), `metadata` (optional).

### `POST /api/v1/agent/heartbeat`
Records agent connectivity and alive status.
- **Requires Auth:** Yes (`X-Agent-Auth` header)
- **Payload:** `agent_id`, `hostname`, `agent_version`, `timestamp`, `connection_status`, `ip_address` (optional).

### `POST /api/v1/agent/events`
Receives raw event telemetry from the agent and queues/persists it for the processing pipeline.
- **Requires Auth:** Yes (`X-Agent-Auth` header)
- **Payload:** `event_id`, `agent_id`, `hostname`, `timestamp`, `event_type`, `source`, `payload` (raw string), `metadata` (optional).

## Configuration
Authentication and database connectivity are configured via the project's root `.env` file or environment variables.

- `COLLECTOR_PORT`: Default 5000
- `AGENT_SHARED_SECRET`: Required environment variable used to authenticate agents.
- `DATABASE_URL`: Inherits from root `.env` but converts to `postgresql+asyncpg://` for async operations.

## Running the Collector
To start the collector locally for development:
```bash
python run.py
```
This will start the Uvicorn server on `0.0.0.0:5000`.

## Testing
Run the automated test suite from within the `collector/` directory:
```bash
python -m pytest tests/
```
