import logging
import os
import uuid
import json
import shutil
import subprocess
from datetime import datetime, timezone
from shared.envelope import create_envelope

logger = logging.getLogger(__name__)

class LinuxLogCollector:
    def __init__(self, log_paths, state_manager, transport, identity, journald_enabled=False):
        self.log_paths = log_paths
        self.state_manager = state_manager
        self.transport = transport
        self.identity = identity
        self.journald_enabled = journald_enabled

    def setup(self):
        logger.info("Setting up Linux log collector")
        if self.journald_enabled and not shutil.which("journalctl"):
            logger.warning("journald is enabled but journalctl is unavailable")
            self.journald_enabled = False
        return True

    def collect_journald(self):
        state_key = "linux_journald"
        state = self.state_manager.get_state(state_key, default={"cursor": None})
        
        # When no cursor exists, bind to the last 50 events to avoid scanning entire historical journal
        # When cursor exists, batch up to 200 events at a time to prevent timeout and memory blowout
        command = ["journalctl", "--no-pager", "--output=json", "--show-cursor"]
        if state.get("cursor"):
            command.extend(["-n", "200", "--after-cursor", state["cursor"]])
        else:
            command.extend(["-n", "50"])

        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=15, check=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            logger.warning("Unable to read journald: %s", error)
            return 0
        if result.returncode != 0:
            logger.warning("journalctl failed with status %s", result.returncode)
            return 0

        events_collected = 0
        new_cursor = None
        for line in result.stdout.splitlines():
            if line.startswith("-- cursor:"):
                new_cursor = line.partition(":")[2].strip()
                continue
            try:
                raw_event = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("Ignoring malformed journald record")
                continue
            cursor = raw_event.get("__CURSOR")
            if not cursor:
                continue
            timestamp = raw_event.get("_SOURCE_REALTIME_TIMESTAMP")
            if timestamp:
                try:
                    timestamp = datetime.fromtimestamp(int(timestamp) / 1000000, timezone.utc).isoformat()
                except (TypeError, ValueError, OverflowError):
                    timestamp = None
            envelope = create_envelope(
                identity=self.identity,
                event_type="journald_event",
                source="linux_journald",
                payload={"raw_event": raw_event},
                event_id=cursor,
                timestamp=timestamp,
            )
            self.transport.send_event(envelope)
            new_cursor = cursor
            events_collected += 1

        if new_cursor:
            state["cursor"] = new_cursor
            self.state_manager.set_state(state_key, state)
        return events_collected

    def _get_file_identity(self, path):
        try:
            st = os.stat(path)
            return {"inode": st.st_ino, "size": st.st_size}
        except OSError:
            return None

    def collect_file(self, path):
        state_key = f"linux_file_{path.replace('/', '_')}"
        state = self.state_manager.get_state(state_key, default={"inode": None, "offset": 0})
        
        file_id = self._get_file_identity(path)
        if not file_id:
            logger.debug(f"File {path} not found or inaccessible")
            return 0
            
        # Handle log rotation / truncation
        if state["inode"] != file_id["inode"]:
            logger.info(f"Log rotation detected for {path} (inode changed)")
            state["offset"] = 0
            state["inode"] = file_id["inode"]
        elif file_id["size"] < state["offset"]:
            logger.info(f"Log truncation detected for {path} (size < offset)")
            state["offset"] = 0
            
        events_collected = 0
        
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(state["offset"])
                
                while True:
                    line = f.readline()
                    if not line:
                        break
                        
                    line = line.strip()
                    if not line:
                        continue
                        
                    offset = f.tell()
                    dedup_id = f"{path}-{state['inode']}-{offset}"
                    
                    envelope = create_envelope(
                        identity=self.identity,
                        event_type="syslog_event",
                        source=f"linux_file_{os.path.basename(path)}",
                        payload={"raw_line": line, "filepath": path},
                        event_id=dedup_id,
                        timestamp=datetime.now(timezone.utc).isoformat()
                    )
                    
                    self.transport.send_event(envelope)
                    events_collected += 1
                    state["offset"] = offset
                    
                self.state_manager.set_state(state_key, state)
                
        except PermissionError:
            logger.warning(f"Permission denied reading {path}")
        except Exception as e:
            logger.error(f"Error reading {path}: {e}")
            
        return events_collected

    def collect(self):
        total = 0
        if self.journald_enabled:
            total += self.collect_journald()
        for path in self.log_paths:
            total += self.collect_file(path)
        return total
