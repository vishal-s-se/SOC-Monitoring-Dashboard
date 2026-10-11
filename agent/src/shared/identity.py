import os
import uuid
import platform
import socket

__version__ = "0.1.0"

class Identity:
    def __init__(self, id_file="agent_id.txt"):
        self.id_file = id_file
        self.agent_id = self._load_or_generate_id()
        self.hostname = socket.gethostname()
        self.os_type = platform.system()
        self.os_version = platform.release()
        self.agent_version = __version__
        self.ip_address = self._get_primary_ip()

    def _load_or_generate_id(self):
        if os.path.exists(self.id_file):
            with open(self.id_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
        
        # Generate new ID if file doesn't exist or is empty
        new_id = str(uuid.uuid4())
        parent = os.path.dirname(os.path.abspath(self.id_file))
        os.makedirs(parent, mode=0o700, exist_ok=True)
        with open(self.id_file, "w", encoding="utf-8") as f:
            f.write(new_id)
        try:
            os.chmod(self.id_file, 0o600)
        except OSError:
            pass
        return new_id

    def _get_primary_ip(self):
        try:
            # Create a dummy socket to determine primary IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            # Doesn't have to be reachable
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = "127.0.0.1"
        finally:
            s.close()
        return ip

    def to_dict(self):
        return {
            "agent_id": self.agent_id,
            "hostname": self.hostname,
            "operating_system": f"{self.os_type} {self.os_version}",
            "agent_version": self.agent_version,
            "ip_address": self.ip_address
        }
