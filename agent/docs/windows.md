# Windows Agent

## Implemented

The Windows collector uses the native Windows Event Log API exposed by `pywin32` (`EvtQuery`, `EvtNext`, and `EvtRender`). Security, System, and Application are enabled by default. Each channel has a durable bookmark and events preserve parsed fields plus the original XML payload.

## Optional Sources

Additional provider channels can be added in `agent.yml` when present on the host, including `Microsoft-Windows-PowerShell/Operational`, `Microsoft-Windows-Windows Defender/Operational`, `Microsoft-Windows-Windows Firewall With Advanced Security/Firewall`, and `Microsoft-Windows-TerminalServices-LocalSessionManager/Operational`. Missing channels and permission failures are logged and do not stop other channels.

Service/process telemetry is not implemented by this agent. Username, source IP, and destination fields are preserved when supplied by the event's own `EventData`; the agent does not fabricate them.

## Validation

Run `python -m pytest -q` for mocked Windows collector coverage. Validate actual providers on a Windows host with a local configuration and the collector test event before enabling additional channels.