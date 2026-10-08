# Windows Agent Guide

The Windows Agent securely monitors local event logs and transmits them to the SOC Collector.

## Features
- **Event Collection**: Monitors `Application`, `System`, and `Security` channels.
- **Bookmarks**: Retains `EvtQuery` bookmarks to survive restarts without duplicating events.
- **Buffering**: Retries failed transmissions (e.g., if the Collector is offline) using local state.
- **Heartbeat**: Sends periodic liveness checks.

## Limitations
- **Security Log**: Requires the agent to be run as an **Administrator**. Unprivileged execution results in `Access is denied` for the Security channel (though Application/System function normally).

## Packaging
The agent can be packaged into a standalone executable using PyInstaller:
```powershell
# Inside SOC Monitering Agent repo
.\scriptsuild_windows.ps1
```
Yields: `dist/soc-agent.exe`.
