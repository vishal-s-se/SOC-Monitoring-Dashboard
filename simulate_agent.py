import httpx
import datetime
import uuid
import time
import json
import asyncio

COLLECTOR_URL = "http://localhost:5000/api/v1/agent"
AUTH_HEADER = {"X-Agent-Auth": "changeme_secret", "Content-Type": "application/json"}

AGENT_ID = str(uuid.uuid4())
HOSTNAME = "test-windows-host"
IP = "192.168.1.100"

async def main():
    async with httpx.AsyncClient() as client:
        payload = {
            "agent_id": AGENT_ID,
            "hostname": HOSTNAME,
            "operating_system": "Windows 10",
            "agent_version": "1.0.0",
            "ip_address": IP,
            "metadata_": {"simulated": True}
        }
        await client.post(f"{COLLECTOR_URL}/register", headers=AUTH_HEADER, json=payload)
        await asyncio.sleep(0.5)

        raw_payload = {
            "System": {
                "EventID": 4624,
                "Level": "3"
            },
            "EventData": {
                "TargetUserName": "admin",
                "IpAddress": "10.0.0.5"
            }
        }
        
        payload = {
            "event_id": str(uuid.uuid4()),
            "agent_id": AGENT_ID,
            "hostname": HOSTNAME,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "event_type": "windows_event_log",
            "source": "windows",
            "payload": json.dumps(raw_payload)
        }
        r = await client.post(f"{COLLECTOR_URL}/events", headers=AUTH_HEADER, json=payload)
        print("Event (EventID 4624):", r.status_code, r.text)
        
        await asyncio.sleep(2.5) # Wait for DB Poller (2s interval)

asyncio.run(main())
