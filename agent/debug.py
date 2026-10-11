import os
import requests

url = os.environ.get("SOC_AGENT_COLLECTOR_URL", "http://localhost:5000") + "/api/v1/agent/register"
auth_token = os.environ.get("SOC_AGENT_AUTH_TOKEN", "")
headers = {"X-Agent-Auth": auth_token} if auth_token else {}
payload = {
    "agent_id": os.environ.get("SOC_AGENT_ID", "debug-agent"),
    "hostname": os.environ.get("COMPUTERNAME", "debug-host"),
    "operating_system": "Windows",
    "agent_version": "0.1.0",
    "ip_address": "127.0.0.1"
}

res = requests.post(url, headers=headers, json=payload)
print(res.status_code)
print(res.text)
