#!/bin/bash
sed -i 's/host: .*/host: "172.30.144.1"/g' /etc/soc-monitor-agent/agent.yml
sed -i 's/auth_token: .*/auth_token: "183e630d-a30a-469d-8463-b7d5e336cc4f"/g' /etc/soc-monitor-agent/agent.yml
