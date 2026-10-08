import httpx
import asyncio
import json
from datetime import datetime, timezone
import uuid

async def seed_data():
    base_url = "http://localhost:8000/api/v1"
    collector_url = "http://localhost:5000/api/v1/agent"
    
    headers = {"X-Agent-Auth": "changeme_secret", "Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        # Register an agent
        agent_id = "11111111-1111-1111-1111-111111111111"
        hostname = "e2e-test-host"
        await client.post(f"{collector_url}/register", headers=headers, json={
            "agent_id": agent_id,
            "hostname": hostname,
            "operating_system": "Windows 10",
            "agent_version": "1.0.0",
            "ip_address": "192.168.100.10",
            "metadata_": {"e2e": True}
        })
        
        # Send an event that triggers an alert (e.g. RULE-004)
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
        
        await client.post(f"{collector_url}/events", headers=headers, json={
            "event_id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "hostname": hostname,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": "windows_event_log",
            "source": "windows",
            "payload": json.dumps(raw_payload)
        })
        
        # Also send a normal event for Live Events view
        await client.post(f"{collector_url}/events", headers=headers, json={
            "event_id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "hostname": hostname,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": "auth",
            "source": "linux",
            "payload": json.dumps({"message": "Accepted publickey for testuser from 10.0.0.1", "process": "sshd"})
        })

        # Generate an admin token for the frontend
        login_res = await client.post("http://localhost:8000/api/v1/auth/login", json={
            "username": "admin",
            "password": "changeme123"
        }, headers={"Content-Type": "application/json"})
        
        if login_res.status_code != 200:
            print("LOGIN FAILED:", login_res.text)
            return

        token = login_res.json().get("access_token")
        
        with open("e2e_token.txt", "w") as f:
            f.write(token)

if __name__ == "__main__":
    asyncio.run(seed_data())
