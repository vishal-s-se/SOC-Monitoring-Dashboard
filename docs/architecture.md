# Architecture & Data Flow

SOC Monitor follows a strict distributed architecture, ensuring raw telemetry is securely buffered, processed, and visualized.

## System Diagram

```text
[ Windows Agent ]      [ Linux Agent ]
        │                     │
        └─────────┬───────────┘
                  ▼
         [ Collector API ] :5000  (Ingestion Boundary, Auth, Validation)
                  │
                  ▼
      [ Normalization Pipeline ]  (Raw JSON -> Unified Event Schema)
                  │
                  ▼
          [ PostgreSQL ] :5432    (Persistence: RawLogs, Events, Alerts)
                  │
                  ▼
       [ Detection & Correlation ] (DBPollingTransport / Threat Engine)
                  │
                  ▼
         [ Backend API ] :8000    (Core Logic, Auth, WebSockets)
                  │
                  ▼
       [ Next.js Dashboard ] :3000 (Realtime UI, Investigations)
```

## Component Responsibilities
1. **Agents**: Do **NOT** directly access the database or dashboard. They solely securely transmit telemetry to the Collector.
2. **Collector**: Validates `AGENT_SHARED_SECRET`, parses envelopes, drops malformed data (422), and writes to PostgreSQL.
3. **Backend API**: Hosts the detection engine, polls recent DB inserts, runs correlation algorithms, manages the Alert lifecycle, and broadcasts WebSocket messages.
4. **Dashboard**: Consumes the API and WebSockets.

## Data Flow Lifecycle
`RAW LOG` → `AGENT` → `COLLECTOR` → `RAW EVENT` → `NORMALIZATION` → `DETECTION` → `CORRELATION` → `ALERT` → `DATABASE` → `API` → `WEBSOCKET` → `DASHBOARD` → `INVESTIGATION`

*Note*: Raw evidence is permanently preserved at the `RAW EVENT` stage, ensuring analysts can always trace an alert back to its original JSON payload.
