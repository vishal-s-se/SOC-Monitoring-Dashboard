# Endpoint Agents

The endpoint agents send telemetry only to the collector at `:5000`. They do not connect to the dashboard, backend API, or PostgreSQL. Both agents use the existing `X-Agent-Auth` header and collector routes:

- `POST /api/v1/agent/register`
- `POST /api/v1/agent/heartbeat`
- `POST /api/v1/agent/events`

## Shared configuration

Configuration is supplied through environment variables. Secrets are never stored in source code.

| Variable | Default | Purpose |
|---|---|---|
| `SOC_AGENT_COLLECTOR_HOST` | `127.0.0.1` | Collector host |
| `SOC_AGENT_COLLECTOR_PORT` | `5000` | Collector port |
| `SOC_AGENT_COLLECTOR_SCHEME` | `http` | `http` or `https` |
| `SOC_AGENT_AGENT_AUTH` | empty | Value matching collector `AGENT_SHARED_SECRET` |
| `SOC_AGENT_AGENT_ID` | generated and persisted | Stable agent identity |
| `SOC_AGENT_HOSTNAME` | local hostname | Reported hostname |
| `SOC_AGENT_COLLECTION_INTERVAL` | `15` | Collection interval in seconds |
| `SOC_AGENT_HEARTBEAT_INTERVAL` | `30` | Heartbeat interval in seconds |
| `SOC_AGENT_ENABLED_SOURCES` | platform defaults | Comma-separated source names |
| `SOC_AGENT_BUFFER_PATH` | user home spool path | Durable event spool and identity state directory |
| `SOC_AGENT_BUFFER_SIZE` | `1000` | Maximum buffered events |
| `SOC_AGENT_RETRY_ATTEMPTS` | `3` | Retries after a failed request |
| `SOC_AGENT_TLS_VERIFY` | `true` | Certificate verification for HTTPS |

The buffer is bounded and persisted atomically. Events remain queued when the collector is unavailable and are acknowledged only after a successful collector response. Duplicate event IDs are not enqueued twice.

## Windows

Run from the repository root:

```powershell
$env:SOC_AGENT_AGENT_AUTH = "YOUR_AGENT_TOKEN"
$env:SOC_AGENT_COLLECTOR_HOST = "127.0.0.1"
python -m agents.windows.run
```

Implemented collection uses the native PowerShell `Get-WinEvent` mechanism for these channels when they exist and the service account can read them:

- Security
- System
- Application
- PowerShell Operational
- Windows Defender Operational
- Windows Firewall with Advanced Security
- Terminal Services Local Session Manager (RDP)

The default set is Security, System, and Application. Optional channel names for `SOC_AGENT_ENABLED_SOURCES` are `powershell`, `defender`, `firewall`, and `rdp`. Each event preserves the rendered event record as the raw payload and includes provider, event ID, record ID, channel, level, and timestamp metadata. Missing channels and permission failures are skipped without stopping the agent.

This release does not claim arbitrary process, service, Defender, firewall, or RDP coverage beyond the event channels listed above. Those channels are platform- and policy-dependent.

For future Windows packaging, `agents/windows/run.py` is the service entry point. Building `soc-agent.exe` and an installer requires a Windows packaging environment and is not performed in this repository validation environment.

## Linux

Run from the repository root:

```sh
export SOC_AGENT_AGENT_AUTH=YOUR_AGENT_TOKEN
python -m agents.linux.run
```

The file collector reads only files that exist and are readable:

- `/var/log/auth.log` or `/var/log/secure`
- `/var/log/syslog` or `/var/log/messages`
- `/var/log/kern.log`
- `/var/log/ufw.log`

The agent also attempts `journalctl --output=json` unless `SOC_AGENT_ENABLED_SOURCES` excludes `journald`. It tracks file inode/byte offsets and journald cursors in `source-state.json`, so restarts continue from the last successful read. Raw lines or JSON journal records are preserved as event payloads.

Authentication, SSH, sudo, firewall, kernel, system, and application evidence is collected as available through those sources. Distribution-specific parsers, privileged kernel readers, and dedicated process/service sensors are not implemented.

The installer preparation script is `agents/linux/install.sh`. It copies the agent source into `/opt/soc-agent` by default and prints the next systemd configuration step; it does not register or start a service automatically.

## Troubleshooting and security

- `401` from the collector: verify `SOC_AGENT_AGENT_AUTH` matches `AGENT_SHARED_SECRET`.
- `404 Agent not found`: registration must succeed before heartbeat or event delivery.
- Repeated connection errors: inspect the durable spool and collector health endpoint; events are retained until delivery succeeds or the bounded buffer is full.
- HTTPS deployments: set `SOC_AGENT_COLLECTOR_SCHEME=https`, use a trusted certificate, and keep `SOC_AGENT_TLS_VERIFY=true`.
- Do not place tokens in command history, source files, or logs. Agent logs report operational failures without logging request headers or payload credentials.
