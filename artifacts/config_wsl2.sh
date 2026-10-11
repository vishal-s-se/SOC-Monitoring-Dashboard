#!/bin/bash
sed -i 's/host: .*/host: "172.30.144.1"/g' /etc/soc-monitor-agent/agent.yml
sed -i 's/auth_token: .*/auth_token: "b48bfb5f-1c10-4cc9-aa82-1225f9c376fb"/g' /etc/soc-monitor-agent/agent.yml
