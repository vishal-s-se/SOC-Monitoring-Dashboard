import os
import sys
import time
import logging
import argparse
import platform

from shared.config import Config
from shared.identity import Identity
from shared.buffer import EventBuffer
from shared.transport import Transport
from shared.heartbeat import HeartbeatThread

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("agent")

def main():
    parser = argparse.ArgumentParser(description="SOC Monitoring Agent (Phase 3B)")
    parser.add_argument("-c", "--config", default="agent.yml", help="Path to configuration file")
    parser.add_argument("--test-event", action="store_true", help="Send a synthetic test event and exit")
    args = parser.parse_args()

    logger.info("Starting SOC Agent...")
    
    try:
        config = Config(args.config)
    except Exception as e:
        logger.error(f"Failed to load configuration: {e}")
        sys.exit(1)

    identity = Identity(id_file=config.id_file)
    logger.info(f"Agent ID: {identity.agent_id}")
    logger.info(f"Hostname: {identity.hostname}")
    logger.info(f"OS: {identity.os_type} {identity.os_version}")
    
    buffer_path = os.path.join(config.state_dir, "event-buffer.jsonl")
    buffer = EventBuffer(max_size=config.buffer_max_events, persistence_path=buffer_path)
    transport = Transport(config, identity, buffer)
    
    logger.info("Registering with collector...")
    # Will block/retry indefinitely until collector is reachable
    transport.register()

    # Determine OS specific foundation
    os_type = platform.system().lower()
    foundation = None
    if os_type == "windows":
        from windows.foundation import WindowsAgentFoundation
        foundation = WindowsAgentFoundation(transport)
    elif os_type == "linux":
        from linux.foundation import LinuxAgentFoundation
        foundation = LinuxAgentFoundation(transport)
    else:
        logger.warning(f"Unsupported OS: {os_type}. Running with shared core only.")

    if foundation:
        foundation.start()

    if args.test_event:
        logger.info("Running in test-event mode.")
        if foundation:
            foundation.send_test_event()
        else:
            # Fallback for other OSes
            import uuid
            from datetime import datetime, timezone
            event = {
                "event_id": str(uuid.uuid4()),
                "agent_id": identity.agent_id,
                "hostname": identity.hostname,
                "operating_system": f"{identity.os_type} {identity.os_version}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": "synthetic_test",
                "source": "generic_foundation",
                "payload": "Synthetic test event from generic agent."
            }
            transport.send_event(event)
            
        logger.info("Test event sent. Exiting.")
        sys.exit(0)

    # Start Heartbeat
    heartbeat_thread = HeartbeatThread(transport, interval=config.heartbeat_interval)
    heartbeat_thread.start()

    try:
        # Keep main thread alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Agent shutting down...")
    finally:
        heartbeat_thread.stop()
        if foundation:
            foundation.stop()
        logger.info("Agent stopped.")

if __name__ == "__main__":
    main()
