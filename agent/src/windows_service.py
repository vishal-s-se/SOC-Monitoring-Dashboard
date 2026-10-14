import win32serviceutil
import win32service
import win32event
import servicemanager
import socket
import sys
import os
import threading
import time
import logging

# Ensure ProgramData directory exists for logs
program_data = os.path.join(os.getenv('PROGRAMDATA', 'C:\\ProgramData'), 'SOCMonitorAgent')
os.makedirs(program_data, exist_ok=True)

# Set up logging early for service debugging
logging.basicConfig(
    filename=os.path.join(program_data, 'service.log'),
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("windows_service")

class SOCAgentService(win32serviceutil.ServiceFramework):
    _svc_name_ = "SOCMonitorAgent"
    _svc_display_name_ = "SOC Monitor Agent"
    _svc_description_ = "Endpoints telemetry agent for SOC Monitor"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.is_running = True
        self.agent_thread = None

    def SvcStop(self):
        logger.info("Service stop requested")
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        self.is_running = False

    def SvcDoRun(self):
        logger.info("Service starting")
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, '')
        )
        self.main()

    def main(self):
        try:
            # We must import agent core dynamically to ensure paths are correct
            # Pyinstaller extracts to a temp dir when using --onefile
            app_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
            
            from shared.config import Config
            from shared.identity import Identity
            from shared.buffer import EventBuffer
            from shared.transport import Transport
            from shared.heartbeat import HeartbeatThread
            from windows.foundation import WindowsAgentFoundation

            # Resolve config path
            program_data = os.path.join(os.getenv('PROGRAMDATA', 'C:\\ProgramData'), 'SOCMonitorAgent')
            os.makedirs(program_data, exist_ok=True)
            
            config_path = os.path.join(program_data, "agent.yml")
            if not os.path.exists(config_path):
                logger.error(f"Config not found at {config_path}")
                # Fallback to local
                config_path = "agent.yml"
                
            config = Config(config_path)
            # Ensure state dir points to ProgramData
            config.data["agent"]["state_dir"] = os.path.join(program_data, "state")
            os.makedirs(config.data["agent"]["state_dir"], exist_ok=True)
            # Ensure id_file points to ProgramData
            config.data["agent"]["id_file"] = os.path.join(program_data, "agent_id.txt")
            
            identity = Identity(id_file=config.id_file)
            buffer_path = os.path.join(config.state_dir, "event-buffer.jsonl")
            buffer = EventBuffer(max_size=config.buffer_max_events, persistence_path=buffer_path)
            transport = Transport(config, identity, buffer)
            
            transport.register()

            foundation = WindowsAgentFoundation(transport)
            foundation.start()

            heartbeat_thread = HeartbeatThread(transport, interval=config.heartbeat_interval)
            heartbeat_thread.start()
            
            logger.info("Service loop running")
            
            def _persist_health():
                try:
                    import json
                    os.makedirs(config.state_dir, exist_ok=True)
                    health_file = os.path.join(config.state_dir, "health.json")
                    health_data = transport.check_health()
                    health_data["collector_channels"] = {
                        "active": [c for c in foundation.collector.channels if c not in foundation.collector.unavailable_channels],
                        "unavailable_skipped": list(foundation.collector.unavailable_channels)
                    }
                    temp_health = health_file + f".tmp-{os.getpid()}"
                    with open(temp_health, "w", encoding="utf-8") as hf:
                        json.dump(health_data, hf, indent=2)
                    os.replace(temp_health, health_file)
                except Exception as he:
                    logger.warning(f"Failed to persist health.json: {he}")

            # Write initial health state on startup
            _persist_health()
            last_health_write = time.time()

            while self.is_running:
                # Wait for stop event or timeout
                rc = win32event.WaitForSingleObject(self.hWaitStop, 1000)
                if rc == win32event.WAIT_OBJECT_0:
                    break

                # Write live health diagnostics to state/health.json every 30 seconds
                now = time.time()
                if now - last_health_write >= 30:
                    last_health_write = now
                    _persist_health()

            logger.info("Service loop exiting")
            heartbeat_thread.stop()
            foundation.stop()
            
        except Exception as e:
            logger.exception("Error in service main loop")
            servicemanager.LogErrorMsg(f"Error in SOC Monitor Agent: {str(e)}")

if __name__ == '__main__':
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(SOCAgentService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(SOCAgentService)
