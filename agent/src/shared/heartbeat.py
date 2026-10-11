import time
import threading
import logging

logger = logging.getLogger(__name__)

class HeartbeatThread(threading.Thread):
    def __init__(self, transport, interval=60):
        super().__init__()
        self.transport = transport
        self.interval = interval
        self.daemon = True
        self.running = False
        self.stop_event = threading.Event()

    def start(self):
        self.running = True
        super().start()

    def stop(self):
        self.running = False
        self.stop_event.set()
        
    def run(self):
        logger.info(f"Starting heartbeat thread (interval: {self.interval}s)")
        while self.running:
            try:
                # If transport became unregistered (e.g. collector restart or network issue),
                # try to re-register before sending heartbeat.
                if not self.transport.registered:
                    logger.info("Agent not registered. Attempting registration...")
                    self.transport.register(max_retries=1)
                
                if self.transport.registered:
                    success = self.transport.send_heartbeat()
                    if success:
                        # If heartbeat succeeds, try flushing the buffer
                        self.transport.flush_buffer()
            except Exception as e:
                logger.error(f"Error in heartbeat thread: {e}")
                
            # Wait for the interval or until stopped
            self.stop_event.wait(self.interval)
