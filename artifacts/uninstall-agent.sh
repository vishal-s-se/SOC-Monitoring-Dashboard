#!/usr/bin/env bash
# ==============================================================================
# SOC Monitor Linux Agent Uninstaller
# ==============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: Root privileges required. Run with sudo." >&2
    exit 1
fi

FULL_CLEANUP="${1:-}"

echo "Stopping and disabling soc-agent service..."
systemctl stop soc-agent 2>/dev/null || true
systemctl disable soc-agent 2>/dev/null || true

echo "Purging soc-monitor-agent package..."
dpkg --purge soc-monitor-agent 2>/dev/null || true

if [ "$FULL_CLEANUP" = "--full" ] || [ "$FULL_CLEANUP" = "-f" ]; then
    echo "Performing full cleanup: deleting configuration and state..."
    rm -rf /etc/soc-monitor-agent
    rm -rf /var/lib/soc-monitor-agent
    rm -rf /opt/soc-monitor-agent
    echo "Full local cleanup completed."
else
    echo "Agent service and package removed."
    echo "Note: Local identity (/var/lib/soc-monitor-agent/agent_id.txt) and configuration have been PRESERVED."
    echo "Historical events and investigations on the SOC Monitor server remain intact."
    echo "To remove local identity and state files completely, rerun with: $0 --full"
fi
echo "Uninstall complete."
