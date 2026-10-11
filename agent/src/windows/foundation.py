import logging
import threading
import time
from .collector import WindowsEventLogCollector
from shared.state import StateManager

logger = logging.getLogger(__name__)

class WindowsAgentFoundation:
    def __init__(self, transport):
        self.transport = transport
        self.config = transport.config
        self.identity = transport.identity
        self._running = False
        self._thread = None
        
        self.state_manager = StateManager(self.config.state_dir)
        self.collector = WindowsEventLogCollector(
            channels=self.config.windows_channels,
            state_manager=self.state_manager,
            transport=self.transport,
            identity=self.identity
        )

    def start(self):
        logger.info("Initializing Windows specific agent foundation...")
        if not self.collector.setup():
            logger.warning("Windows collection setup failed or disabled.")
            
        self._running = True
        self._thread = threading.Thread(target=self._run_collection_loop, daemon=True)
        self._thread.start()
        
    def _run_collection_loop(self):
        interval = self.config.collection_interval
        while self._running:
            try:
                events = self.collector.collect()
                if events > 0:
                    logger.debug(f"Collected {events} Windows events.")
            except Exception as e:
                logger.error(f"Error in Windows collection loop: {e}")
                
            time.sleep(interval)
            
    def send_test_event(self):
        logger.info("Sending synthetic Windows test event")
        import uuid
        from datetime import datetime, timezone
        event = {
            "event_id": str(uuid.uuid4()),
            "agent_id": self.transport.identity.agent_id,
            "hostname": self.transport.identity.hostname,
            "operating_system": f"{self.transport.identity.os_type} {self.transport.identity.os_version}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": "synthetic_test",
            "source": "windows_foundation",
            "payload": "This is a synthetic test event from the Windows Agent foundation.",
        }
        return self.transport.send_event(event)

    def stop(self):
        logger.info("Stopping Windows specific agent foundation...")
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
