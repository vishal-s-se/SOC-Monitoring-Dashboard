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

        # Health tracking metrics
        self.last_registration_time = None
        self.last_registration_status = False
        self.last_heartbeat_time = None
        self.last_heartbeat_status = False
        self.last_event_ingestion_time = None
        self.last_event_ingestion_status = False
        self.events_sent_count = 0
        self.events_flushed_count = 0
        self.consecutive_heartbeat_failures = 0
        self.consecutive_event_failures = 0

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
                    self.last_registration_time = time.time()
                    self.last_registration_status = True
                    return True
                else:
                    logger.warning(f"Registration failed with status code {response.status_code}")
                    self.last_registration_status = False
            except requests.exceptions.RequestException as e:
                logger.warning(f"Registration failed: {e}")
                self.last_registration_status = False
                
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
            self.last_heartbeat_status = False
            self.consecutive_heartbeat_failures += 1
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
                self.last_heartbeat_time = time.time()
                self.last_heartbeat_status = True
                self.consecutive_heartbeat_failures = 0
                return True
            else:
                logger.warning(f"Heartbeat rejected: {response.status_code}")
                self.last_heartbeat_status = False
                self.consecutive_heartbeat_failures += 1
                # Re-registration might be needed if collector forgot us
                if response.status_code in (401, 403, 404):
                    self.registered = False
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to send heartbeat: {e}")
            self.last_heartbeat_status = False
            self.consecutive_heartbeat_failures += 1
            
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
            self.last_event_ingestion_status = False
            self.consecutive_event_failures += 1
            return False
            
        url = f"{self.base_url}/api/v1/agent/events"
        try:
            response = self.session.post(url, json=event, timeout=5)
            if response.status_code in (200, 201, 202):
                self.last_event_ingestion_time = time.time()
                self.last_event_ingestion_status = True
                self.events_sent_count += 1
                self.consecutive_event_failures = 0
                return True
            else:
                logger.warning(f"Event rejected: {response.status_code}")
                self.buffer.add(event)
                self.last_event_ingestion_status = False
                self.consecutive_event_failures += 1
                if response.status_code in (401, 403, 404):
                    self.registered = False
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to send event: {e}")
            self.buffer.add(event)
            self.last_event_ingestion_status = False
            self.consecutive_event_failures += 1
            
        return False

    def flush_buffer(self):
        """Attempt to send all buffered events."""
        if not self.registered or self.buffer.is_empty():
            return
            
        url = f"{self.base_url}/api/v1/agent/events"
        buffered_count = self.buffer.size()
        acknowledged = 0
        for event in self.buffer.get_all():
            try:
                response = self.session.post(url, json=event, timeout=5)
            except requests.exceptions.RequestException as error:
                logger.warning(
                    f"Outage recovery halted: Collector unreachable while flushing buffer ({error}). {buffered_count - acknowledged} events remain buffered."
                )
                self.consecutive_event_failures += 1
                break

            if response.status_code in (200, 201, 202):
                acknowledged += 1
                self.last_event_ingestion_time = time.time()
                self.last_event_ingestion_status = True
                self.events_flushed_count += 1
                self.consecutive_event_failures = 0
                continue

            logger.warning("Failed to flush event: %s", response.status_code)
            self.consecutive_event_failures += 1
            if response.status_code in (401, 403, 404):
                self.registered = False
            break

        if acknowledged:
            self.buffer.discard_prefix(acknowledged)
            remaining = self.buffer.size()
            logger.info(
                f"Outage recovery update: Successfully flushed {acknowledged} backlog events to collector. {remaining} events remaining in buffer."
            )

    def check_health(self):
        """
        Evaluate and return discrete health status distinguishing:
        1. service_running: True (evaluated by runtime process)
        2. collector_registration: Whether agent is currently registered with collector
        3. heartbeat: Status and timing of last heartbeat
        4. event_ingestion: Status and timing of last event ingestion
        5. buffer: Current buffer telemetry, capacity, and discard counters
        """
        buffer_stats = self.buffer.get_stats() if hasattr(self.buffer, "get_stats") else {
            "size": self.buffer.size(),
            "max_size": self.buffer.max_size,
            "discarded_count": getattr(self.buffer, "discarded_count", 0),
            "is_full": self.buffer.size() >= self.buffer.max_size
        }

        # Overall connection health determination
        is_healthy = (
            self.registered
            and (self.last_heartbeat_status or self.last_heartbeat_time is None)
            and self.consecutive_heartbeat_failures == 0
        )

        event_status = (
            "INGESTING" if self.last_event_ingestion_status and self.consecutive_event_failures == 0
            else ("ERROR" if self.consecutive_event_failures > 0
                  else ("IDLE" if self.last_event_ingestion_time is None else "IDLE"))
        )

        return {
            "service_running": True,
            "collector_registration": {
                "registered": self.registered,
                "last_registration_time": self.last_registration_time,
                "status": "REGISTERED" if self.registered else "UNREGISTERED"
            },
            "heartbeat": {
                "last_success_time": self.last_heartbeat_time,
                "last_status": self.last_heartbeat_status,
                "consecutive_failures": self.consecutive_heartbeat_failures,
                "status": "HEALTHY" if self.last_heartbeat_status else ("PENDING" if self.last_heartbeat_time is None else "FAILING")
            },
            "event_ingestion": {
                "last_success_time": self.last_event_ingestion_time,
                "last_status": self.last_event_ingestion_status,
                "events_sent_live": self.events_sent_count,
                "events_flushed_from_buffer": self.events_flushed_count,
                "consecutive_failures": self.consecutive_event_failures,
                "status": event_status
            },
            "buffer": buffer_stats,
            "overall_status": "HEALTHY" if is_healthy else ("DEGRADED" if self.registered else "OFFLINE")
        }

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
