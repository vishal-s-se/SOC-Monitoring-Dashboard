import hashlib
import json
import platform
import subprocess
from typing import Any, Callable

from agents.common.events import AgentEvent
from agents.common.identity import AgentIdentity


class WindowsEventCollector:
    CHANNELS = {
        "security": "Security",
        "system": "System",
        "application": "Application",
        "powershell": "Microsoft-Windows-PowerShell/Operational",
        "defender": "Microsoft-Windows-Windows Defender/Operational",
        "firewall": "Microsoft-Windows-Windows Firewall With Advanced Security/Firewall",
        "rdp": "Microsoft-Windows-TerminalServices-LocalSessionManager/Operational",
    }

    def __init__(self, identity: AgentIdentity, state: dict[str, int] | None = None, runner: Callable[..., subprocess.CompletedProcess[str]] | None = None):
        self.identity = identity
        self.state = state if state is not None else {}
        self.runner = runner or subprocess.run

    def collect(self, sources: set[str] | None = None) -> list[AgentEvent]:
        if platform.system().lower() != "windows" and self.runner is subprocess.run:
            return []
        selected = sources or {"security", "system", "application"}
        events: list[AgentEvent] = []
        for source_name in selected:
            channel = self.CHANNELS.get(source_name)
            if not channel:
                continue
            events.extend(self._collect_channel(source_name, channel))
        return events

    def _collect_channel(self, source_name: str, channel: str) -> list[AgentEvent]:
        last_record = int(self.state.get(source_name, 0))
        script = (
            "$events = Get-WinEvent -LogName '{channel}' -MaxEvents 200 -ErrorAction Stop; "
            "$events | ForEach-Object {{ [ordered]@{{ "
            "RecordId=$_.RecordId; Id=$_.Id; TimeCreated=$_.TimeCreated.ToUniversalTime().ToString('o'); "
            "ProviderName=$_.ProviderName; LevelDisplayName=$_.LevelDisplayName; "
            "MachineName=$_.MachineName; Message=$_.Message; LogName=$_.LogName "
            "}} }} | ConvertTo-Json -Compress -Depth 5"
        ).format(channel=channel.replace("'", "''"))
        try:
            result = self.runner(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                capture_output=True,
                text=True,
                check=False,
            )
        except (OSError, PermissionError):
            return []
        if result.returncode != 0 or not result.stdout.strip():
            return []
        try:
            records: Any = json.loads(result.stdout)
        except json.JSONDecodeError:
            return []
        if isinstance(records, dict):
            records = [records]
        events: list[AgentEvent] = []
        maximum_record = last_record
        for record in records if isinstance(records, list) else []:
            if not isinstance(record, dict):
                continue
            record_id = int(record.get("RecordId") or 0)
            if record_id <= last_record:
                continue
            maximum_record = max(maximum_record, record_id)
            raw = json.dumps(record, separators=(",", ":"), sort_keys=True)
            event_id = hashlib.sha256(f"{channel}:{record_id}".encode()).hexdigest()
            events.append(AgentEvent.create(
                self.identity,
                event_type="windows_event",
                source=f"windows_{source_name}",
                payload=raw,
                event_id=event_id,
                metadata={
                    "channel": channel,
                    "event_id": record.get("Id"),
                    "provider": record.get("ProviderName"),
                    "record_id": record_id,
                    "level": record.get("LevelDisplayName"),
                },
            ))
        self.state[source_name] = maximum_record
        return events
