import yaml
import os

class Config:
    def __init__(self, config_path="agent.yml"):
        self.config_path = config_path
        self.data = self._load_config()

    def _load_config(self):
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Configuration file not found: {self.config_path}")
        
        with open(self.config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            
        self._validate_config(data)
        return data

    def _validate_config(self, data):
        if not data:
            raise ValueError("Configuration is empty.")
        if "collector" not in data:
            raise ValueError("Missing 'collector' section in configuration.")
        if "host" not in data["collector"]:
            raise ValueError("Missing 'collector.host' in configuration.")
        if "port" not in data["collector"]:
            raise ValueError("Missing 'collector.port' in configuration.")
        if not isinstance(data["collector"]["port"], int) or not 1 <= data["collector"]["port"] <= 65535:
            raise ValueError("'collector.port' must be between 1 and 65535.")
        if not isinstance(data["collector"].get("tls", False), bool):
            raise ValueError("'collector.tls' must be a boolean.")
        if "ca_cert" in data["collector"]:
            if not os.path.isfile(data["collector"]["ca_cert"]):
                raise ValueError(f"CA certificate file not found: {data['collector']['ca_cert']}")
            
        if "agent" not in data:
            data["agent"] = {}
        
        # Set defaults
        data["agent"].setdefault("id_file", "agent_id.txt")
        data["agent"].setdefault("state_dir", "state")
        data["agent"].setdefault("heartbeat_interval", 60)
        data["agent"].setdefault("buffer_max_events", 1000)
        data["agent"].setdefault("collection_interval", 5)
        data["agent"].setdefault("max_payload_bytes", 1048576)
        data["agent"].setdefault("retry_max_delay", 60)
        data["agent"].setdefault("journald_enabled", True)

        if "windows" not in data:
            data["windows"] = {}
        data["windows"].setdefault("channels", [
            "Security",
            "System",
            "Application",
            "Microsoft-Windows-Sysmon/Operational",
            "Microsoft-Windows-PowerShell/Operational",
            "Microsoft-Windows-Windows Defender/Operational"
        ])
        
        if "linux" not in data:
            data["linux"] = {}
        data["linux"].setdefault("log_paths", [
            "/var/log/auth.log",
            "/var/log/syslog",
            "/var/log/messages",
            "/var/log/secure",
            "/var/log/kern.log",
            "/var/log/audit/audit.log"
        ])

    @property
    def collector_url(self):
        protocol = "https" if self.data["collector"].get("tls") else "http"
        host = self.data["collector"]["host"]
        port = self.data["collector"]["port"]
        return f"{protocol}://{host}:{port}"

    @property
    def ca_cert(self):
        return self.data["collector"].get("ca_cert")

    @property
    def auth_token(self):
        return self.data["collector"].get("auth_token") or os.environ.get("SOC_AGENT_AUTH_TOKEN", "")

    @property
    def id_file(self):
        return self.data["agent"]["id_file"]

    @property
    def heartbeat_interval(self):
        return self.data["agent"]["heartbeat_interval"]

    @property
    def buffer_max_events(self):
        return self.data["agent"]["buffer_max_events"]

    @property
    def state_dir(self):
        return self.data["agent"]["state_dir"]

    @property
    def collection_interval(self):
        return self.data["agent"]["collection_interval"]

    @property
    def max_payload_bytes(self):
        return self.data["agent"]["max_payload_bytes"]

    @property
    def retry_max_delay(self):
        return self.data["agent"]["retry_max_delay"]

    @property
    def journald_enabled(self):
        return self.data["agent"]["journald_enabled"]

    @property
    def windows_channels(self):
        return self.data["windows"]["channels"]

    @property
    def linux_log_paths(self):
        return self.data["linux"]["log_paths"]
