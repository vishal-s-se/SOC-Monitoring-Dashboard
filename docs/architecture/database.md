# Database Architecture

This document describes the Phase 2 database architecture for the SOC Monitoring platform.

## Overview
The database layer uses PostgreSQL with SQLAlchemy (async) and Alembic for migrations.

## Entities and Relationships
The core entities map to the telemetry lifecycle:
- **Host**: Represents a monitored endpoint.
- **Agent**: Represents the installed agent software on a Host.
- **RawLog**: Contains the raw, unparsed evidence received from an Agent.
- **Event**: A normalized, standardized security event parsed from a RawLog.
- **Heartbeat**: Agent health status reports.
- **User**: Future platform users (viewers/admins).

```text
HOST
 │
 ├──── AGENT
 │       │
 │       └──── HEARTBEAT
 │
 ├──── RAW_LOG
 │
 └──── EVENT
```

## Important Fields
- **Timestamps**: Uses `DateTime(timezone=True)` for time-series orientation.
- **IP Addresses**: Currently stored as strings, but ready for potential IP-specific typing later.
- **Metadata**: Uses PostgreSQL `JSONB` for arbitrary telemetry context without schema changes.

## Raw Log vs Normalized Event Distinction
To preserve source evidence, `RawLog` stores the exact payload string received from the collector. 
`Event` is derived from `RawLog` during normalization, enabling rich indexing and standard SOC queries.

## Indexing Strategy
Indexes are applied to frequently filtered fields (e.g., `timestamp`, `event_category`, `source_ip`, `agent_id`, `host_id`) to ensure read performance for the future dashboard and analysis engine.
