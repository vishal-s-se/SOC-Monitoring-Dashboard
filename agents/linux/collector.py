import hashlib
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from agents.common.events import AgentEvent
from agents.common.identity import AgentIdentity


@dataclass
class FileCursor:
    inode: int
    offset: int


class LinuxLogCollector:
    DEFAULT_PATHS = (
        "/var/log/auth.log",
        "/var/log/secure",
        "/var/log/syslog",
        "/var/log/messages",
        "/var/log/kern.log",
        "/var/log/ufw.log",
    )

    def __init__(
        self,
        identity: AgentIdentity,
        state: dict[str, dict[str, int]] | None = None,
        paths: Iterable[str] | None = None,
        line_reader: Callable[[Path, int], tuple[list[tuple[int, str]], int]] | None = None,
    ):
        self.identity = identity
        self.state = state if state is not None else {}
        self.paths = tuple(Path(path) for path in (paths or self.DEFAULT_PATHS))
        self.line_reader = line_reader or self._read_lines

    def collect(self) -> list[AgentEvent]:
        events: list[AgentEvent] = []
        for path in self.paths:
            if not path.is_file():
                continue
            try:
                stat = path.stat()
                previous = self.state.get(str(path), {})
                offset = int(previous.get("offset", 0)) if int(previous.get("inode", stat.st_ino)) == stat.st_ino else 0
                lines, next_offset = self.line_reader(path, offset)
                for line_offset, line in lines:
                    if not line.strip():
                        continue
                    source, event_type = self._classify(path, line)
                    event_id = hashlib.sha256(f"{path}:{stat.st_ino}:{line_offset}".encode()).hexdigest()
                    events.append(AgentEvent.create(
                        self.identity,
                        event_type=event_type,
                        source=source,
                        payload=line,
                        event_id=event_id,
                        metadata={"path": str(path), "offset": line_offset, "inode": stat.st_ino},
                    ))
                self.state[str(path)] = {"inode": stat.st_ino, "offset": next_offset}
            except (OSError, PermissionError):
                continue
        return events

    @staticmethod
    def _classify(path: Path, line: str) -> tuple[str, str]:
        name = path.name.lower()
        lowered = line.lower()
        if "auth" in name or "secure" in name or "ssh" in lowered or "sudo" in lowered:
            return "linux_auth", "authentication"
        if "ufw" in name or "firewall" in lowered or "iptables" in lowered:
            return "linux_firewall", "firewall"
        if "kern" in name:
            return "linux_kernel", "kernel"
        return "linux_syslog", "system"

    @staticmethod
    def _read_lines(path: Path, offset: int) -> tuple[list[tuple[int, str]], int]:
        entries: list[tuple[int, str]] = []
        with path.open("rb") as stream:
            stream.seek(offset)
            while True:
                line_offset = stream.tell()
                raw = stream.readline()
                if not raw:
                    break
                entries.append((line_offset, raw.decode("utf-8", errors="replace").rstrip("\r\n")))
            return entries, stream.tell()


class JournaldCollector:
    def __init__(
        self,
        identity: AgentIdentity,
        cursor: str | None = None,
        runner: Callable[..., subprocess.CompletedProcess[str]] | None = None,
    ):
        self.identity = identity
        self.cursor = cursor
        self.runner = runner or subprocess.run

    def collect(self) -> list[AgentEvent]:
        command = ["journalctl", "--no-pager", "--output=json", "--show-cursor"]
        if self.cursor:
            command.extend(["--after-cursor", self.cursor])
        try:
            result = self.runner(command, capture_output=True, text=True, check=False)
        except (OSError, PermissionError):
            return []
        if result.returncode != 0:
            return []
        events: list[AgentEvent] = []
        next_cursor = self.cursor
        for line in result.stdout.splitlines():
            if line.startswith("-- cursor:"):
                next_cursor = line.partition(":")[2].strip() or next_cursor
                continue
            if not line.strip():
                continue
            try:
                journal_record = json.loads(line)
            except json.JSONDecodeError:
                journal_record = {}
            event_key = journal_record.get("__CURSOR") or journal_record.get("__REALTIME_TIMESTAMP") or line
            event_id = hashlib.sha256(str(event_key).encode("utf-8")).hexdigest()
            events.append(AgentEvent.create(
                self.identity,
                event_type="system",
                source="linux_journald",
                payload=line,
                event_id=event_id,
                metadata={"journal_cursor": next_cursor},
            ))
        self.cursor = next_cursor
        return events
