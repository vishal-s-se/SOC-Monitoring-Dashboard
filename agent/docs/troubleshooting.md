# Troubleshooting

## Registration or heartbeat failures

Check the collector host and port, authentication token, TLS setting, and firewall rules. The agent retries registration with increasing delays and logs HTTP status codes without logging the token.

## Events remain buffered

Confirm the collector is reachable and the agent is registered. The durable buffer is `event-buffer.jsonl` under the configured state directory. Only acknowledged events are removed; malformed or rejected events remain for a later retry.

## Windows events are missing

Run as an account permitted to read the selected channel and verify the channel exists in Event Viewer. Optional provider channels are platform-dependent. The agent logs channel-specific failures and continues with available channels.

## Linux events are missing

Check the configured paths, file permissions, rotation behavior, and whether `journalctl` exists when journald is enabled. Give the dedicated service account only the log-reading group membership required by the host.

## Service diagnostics

Use `systemctl status soc-agent` and `journalctl -u soc-agent` on Linux. On Windows, inspect the foreground console or the service manager log. A live collector endpoint is required for end-to-end delivery validation; local tests use the same `/api/v1/agent/` contract paths with deterministic HTTP responses.