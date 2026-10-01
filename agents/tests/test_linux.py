import json
from pathlib import Path
from subprocess import CompletedProcess

from agents.common.identity import AgentIdentity
from agents.linux.collector import JournaldCollector, LinuxLogCollector


IDENTITY = AgentIdentity("agent-1", "linux-host", "linux", "test", "1.0", "127.0.0.1")


def test_linux_file_collector_tracks_offset_and_preserves_raw(tmp_path):
    log = tmp_path / "auth.log"
    log.write_text("Jan 1 sshd[1]: Failed password for root from 10.0.0.2\n", encoding="utf-8")
    state = {}
    collector = LinuxLogCollector(IDENTITY, state=state, paths=[str(log)])
    first = collector.collect()
    second = collector.collect()
    log.write_text(log.read_text(encoding="utf-8") + "Jan 1 sudo: admin : TTY=pts/0\n", encoding="utf-8")
    third = collector.collect()
    assert len(first) == 1
    assert second == []
    assert len(third) == 1
    assert first[0].source == "linux_auth"
    assert "Failed password" in first[0].payload


def test_linux_missing_file_is_ignored(tmp_path):
    collector = LinuxLogCollector(IDENTITY, paths=[str(tmp_path / "missing.log")])
    assert collector.collect() == []


def test_journald_collector_uses_cursor_and_parses_json():
    calls = []

    def runner(command, **kwargs):
        calls.append(command)
        record = {"MESSAGE": "sshd accepted", "_SYSTEMD_UNIT": "sshd.service"}
        return CompletedProcess(command, 0, json.dumps(record) + "\n-- cursor: abc\n", "")

    collector = JournaldCollector(IDENTITY, runner=runner)
    events = collector.collect()
    assert len(events) == 1
    assert collector.cursor == "abc"
    assert "--after-cursor" not in calls[0]
    collector.collect()
    assert "--after-cursor" in calls[1]


def test_journald_unavailable_is_ignored():
    def runner(*args, **kwargs):
        raise PermissionError

    assert JournaldCollector(IDENTITY, runner=runner).collect() == []
