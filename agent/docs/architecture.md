# SOC Monitor Agent Architecture

## Scope

The agent is a separate endpoint process. It contains no dashboard, backend, PostgreSQL client, or local listening server. Its only network peer is the configured SOC Collector.

## Shared Agent Core

The modules under `src/shared/` provide the cross-platform contract:

- `config.py` loads and validates YAML configuration, including collector URL, TLS, authentication, intervals, channels, and log paths.
- `identity.py` creates a stable UUID in the configured runtime identity file.
- `envelope.py` produces the common telemetry envelope used by both collectors.
- `transport.py` registers the agent, sends events and heartbeats, applies retry/backoff to registration, and marks the session unregistered after authentication or registration loss.
- `buffer.py` provides bounded buffering with an optional durable JSONL file when delivery is unavailable; only acknowledged events are removed.
- `state.py` persists collector cursors atomically.
- `heartbeat.py` re-registers, sends heartbeats, and flushes buffered events on an interval.

Collector endpoints are `/api/v1/agent/register`, `/api/v1/agent/heartbeat`, and `/api/v1/agent/events` beneath the configured collector URL. The agent never targets Dashboard `:3000`, Backend `:8000`, or PostgreSQL `:5432`.

## Windows Agent

`src/windows/collector.py` uses the native Windows Event Log API exposed by `pywin32` (`EvtQuery`, `EvtNext`, and `EvtRender`). It supports the configured Security, System, and Application channels by default. Each channel has a durable bookmark, so collection resumes incrementally instead of rereading the entire log. Events are parsed into the shared envelope and sent through the shared transport.

## Linux Agent

`src/linux/collector.py` reads configured log files incrementally. It persists inode and byte-offset state, detects rotation or truncation, and resumes from the correct position. When enabled, it also reads journald JSON records with a durable cursor and safe subprocess arguments. Missing files, unavailable journald, permission failures, and malformed records are handled per source.

## Configuration and Security

Copy `agent.yml.example` to a local `agent.yml`, then set the collector address, TLS setting, and authentication token. Keep real credentials, identity files, state directories, logs, virtual environments, and build output out of version control. TLS is selected with `collector.tls: true`; certificate verification follows the `requests` defaults because no custom certificate bundle is configured.

## Operations

The agent runs in the foreground, exposes no listening ports, and logs registration, collection, retries, heartbeat failures, and buffering through Python logging. `--test-event` sends one synthetic event and exits after initialization. Windows packaging metadata and a Linux systemd unit are provided, but no compiled executable is committed.

## Testing and Limitations

Tests cover shared configuration, identity, transport behavior, authentication loss, durable buffering, payload limits, envelopes, Linux incremental reads, rotation, journald cursors, and Windows collector behavior with mocked Event Log APIs. Live collector integration requires a collector endpoint and credentials; local transport tests exercise the same `/api/v1/agent/` contract paths. Event normalization and detection are collector-side responsibilities.
