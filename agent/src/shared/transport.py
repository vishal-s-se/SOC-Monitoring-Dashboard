import os
import time
import requests
import logging
import json

logger = logging.getLogger(__name__)

class Transport:
    def __init__(self, config, identity, buffer):
        self.config = config
        self.identity = identity
        self.buffer = buffer
        self.session = requests.Session()
        
        if getattr(self.config, "ca_cert", None):
            self.session.verify = self.config.ca_cert
        else:
            self.session.verify = True
        
        self.token_file = os.path.join(self.config.state_dir, "agent_token.txt")
        self._load_token()
            
        self.base_url = self.config.collector_url
        self.registered = False

    def register(self, max_retries=None, retry_delay=5):
        """Register the agent with the collector. Retries indefinitely by default."""
        url = f"{self.base_url}/api/v1/agent/register"
        payload = self.identity.to_dict()
        max_retry_delay = getattr(self.config, "retry_max_delay", 60)
        
        retries = 0
        while True:
            try:
                response = self.session.post(url, json=payload, timeout=10)
                if response.status_code in (200, 201):
                    logger.info("Successfully registered with collector.")
                    data = response.json()
                    if "token" in data:
                        self._save_token(data["token"])
                    self.registered = True
                    return True
                else:
                    logger.warning(f"Registration failed with status code {response.status_code}")
            except requests.exceptions.RequestException as e:
                logger.warning(f"Registration failed: {e}")
                
            retries += 1
            if max_retries is not None and retries >= max_retries:
                logger.error("Max retries reached during registration.")
                return False
                
            logger.info(f"Retrying registration in {retry_delay} seconds...")
            time.sleep(retry_delay)
            # Simple backoff up to 60 seconds
            retry_delay = min(retry_delay * 1.5, max_retry_delay)

    def send_heartbeat(self):
        """Send heartbeat to the collector."""
        if not self.registered:
            logger.warning("Attempted to send heartbeat before registration.")
            return False
            
        url = f"{self.base_url}/api/v1/agent/heartbeat"
        from datetime import datetime, timezone
        payload = {
            "agent_id": self.identity.agent_id,
            "hostname": self.identity.hostname,
            "agent_version": self.identity.agent_version,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "connection_status": "ONLINE",
            "ip_address": self.identity.ip_address
        }
        
        try:
            response = self.session.post(url, json=payload, timeout=5)
            if response.status_code in (200, 202):
                return True
            else:
                logger.warning(f"Heartbeat rejected: {response.status_code}")
                # Re-registration might be needed if collector forgot us
                if response.status_code in (401, 403, 404):
                    self.registered = False
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to send heartbeat: {e}")
            
        return False

    def send_event(self, event):
        """Send a single event to the collector. Buffer if it fails."""
        if not isinstance(event, dict) or not event:
            raise ValueError("event must be a non-empty mapping")
        try:
            encoded_event = json.dumps(event)
        except (TypeError, ValueError) as error:
            raise ValueError("event must be JSON serializable") from error
        max_payload_bytes = getattr(self.config, "max_payload_bytes", 1048576)
        if len(encoded_event.encode("utf-8")) > max_payload_bytes:
            raise ValueError("event exceeds configured payload limit")

        if not self.registered:
            self.buffer.add(event)
            return False
            
        url = f"{self.base_url}/api/v1/agent/events"
        try:
            response = self.session.post(url, json=event, timeout=5)
            if response.status_code in (200, 201, 202):
                return True
            else:
                logger.warning(f"Event rejected: {response.status_code}")
                self.buffer.add(event)
                if response.status_code in (401, 403, 404):
                    self.registered = False
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to send event: {e}")
            self.buffer.add(event)
            
        return False

    def flush_buffer(self):
        """Attempt to send all buffered events."""
        if not self.registered or self.buffer.is_empty():
            return
            
        url = f"{self.base_url}/api/v1/agent/events"
        acknowledged = 0
        for event in self.buffer.get_all():
            try:
                response = self.session.post(url, json=event, timeout=5)
            except requests.exceptions.RequestException as error:
                logger.warning("Failed to flush buffer: %s", error)
                break

            if response.status_code in (200, 201, 202):
                acknowledged += 1
                continue

            logger.warning("Failed to flush event: %s", response.status_code)
            if response.status_code in (401, 403, 404):
                self.registered = False
            break

        if acknowledged:
            self.buffer.discard_prefix(acknowledged)
            logger.info("Successfully flushed %s events.", acknowledged)

    def _load_token(self):
        import os
        if os.path.exists(self.token_file):
            with open(self.token_file, "r") as f:
                token = f.read().strip()
                if token:
                    self.session.headers.update({"X-Agent-Auth": token})
                    return
        if self.config.auth_token:
            self.session.headers.update({"X-Agent-Auth": self.config.auth_token})

    def _save_token(self, token):
        with open(self.token_file, "w") as f:
            f.write(token)
        self.session.headers.update({"X-Agent-Auth": token})
