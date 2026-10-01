import json
from subprocess import CompletedProcess

from agents.common.identity import AgentIdentity
from agents.windows.collector import WindowsEventCollector


IDENTITY = AgentIdentity("agent-1", "win-host", "windows", "test", "1.0", "127.0.0.1")


def test_windows_collector_parses_and_deduplicates_records():
    calls = []
    records = [
        {
            "RecordId": 12,
            "Id": 4625,
            "TimeCreated": "2026-10-01T12:00:00Z",
            "ProviderName": "Microsoft-Windows-Security-Auditing",
            "LevelDisplayName": "Information",
            "Message": "An account failed to log on",
            "LogName": "Security",
        }
    ]

    def runner(command, **kwargs):
        calls.append(command)
        return CompletedProcess(command, 0, json.dumps(records), "")

    collector = WindowsEventCollector(IDENTITY, runner=runner)
    first = collector.collect({"security"})
    second = collector.collect({"security"})
    assert len(first) == 1
    assert second == []
    assert first[0].source == "windows_security"
    assert first[0].metadata["event_id"] == 4625
    assert "Get-WinEvent" in calls[0][-1]
    assert "-LogName 'Security'" in calls[0][-1]


def test_windows_optional_unavailable_channel_is_ignored():
    def runner(*args, **kwargs):
        return CompletedProcess(args[0], 1, "", "channel unavailable")

    collector = WindowsEventCollector(IDENTITY, runner=runner)
    assert collector.collect({"defender", "firewall", "rdp"}) == []
