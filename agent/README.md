# SOC Monitor Endpoint Agent

This repository contains the single authoritative cross-platform endpoint agent for the SOC Monitor system. Phase 11C hardens the shared registration, authentication, transport, durable buffering, state, heartbeat, and incremental telemetry paths.

## Layout

- `src/shared/`: configuration, identity, envelopes, HTTPS transport, retry, bounded buffering, durable state, and heartbeat.
- `src/windows/`: Windows Event Log collection through native Windows Event Log `pywin32` APIs, with channel bookmarks and raw XML preservation.
- `src/linux/`: incremental log-file collection with inode/byte-offset persistence and optional journald cursor recovery.
- `tests/`: shared-core, collector, cursor, rotation, and envelope tests.
- `docs/`: implementation, configuration, installation, platform, and troubleshooting details.

The agent communicates only with the SOC Collector. It does not connect directly to the dashboard, backend, or PostgreSQL.

## Installation and Configuration

```bash
python -m venv .venv
python -m pip install -r requirements.txt
copy agent.yml.example agent.yml
```

On Linux, use `cp agent.yml.example agent.yml`. Set the collector `host`, `port`, TLS flag, and authentication token in the local `agent.yml`, or leave `auth_token` empty and provide `SOC_AGENT_AUTH_TOKEN` in the service environment. Do not commit that local configuration or runtime identity/state files.

The collector API base is `<scheme>://<host>:<port>`, with registration, heartbeat, and event delivery under `/api/v1/agent/`. TLS is enabled with `collector.tls: true`.

## Running

```bash
python src/main.py
python src/main.py --test-event
```

The agent registers before collecting, sends periodic heartbeats, retries registration with backoff, persists bounded events while the collector is unavailable, and flushes only acknowledged events after recovery. Windows collection uses the configured channels by default. Linux collection reads configured log paths and can use journald when enabled; cursors and offsets persist under the configured state directory.

## Testing

```bash
python -m pytest -q
python -m compileall -q src tests
```

The test suite mocks collector HTTP calls, journald, and Windows Event Log APIs, so a live collector or Windows host is not required for automated tests.

## Packaging and Services

Windows packaging is defined by `packaging/soc-agent.spec` and `scripts/build_windows.ps1`. Install PyInstaller in the build environment, run the script on Windows, and configure the resulting `dist/soc-agent.exe`; the executable is not committed. Linux service installation uses `packaging/soc-agent.service`; commands and paths are documented in `docs/installation.md`.

## Current Limitations

- Windows collection requires Windows and the `pywin32` Event Log APIs at runtime. Optional provider channels must exist on the host.
- Journald collection requires `journalctl` and is disabled by default.
- The repository contains packaging configuration, not a compiled executable or installer.
- Event normalization and detection remain collector-side responsibilities.
