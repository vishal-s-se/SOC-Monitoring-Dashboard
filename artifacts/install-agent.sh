#!/usr/bin/env bash
# ==============================================================================
# SOC Monitor Agent — Native Linux / Kali Interactive Installer
# ==============================================================================
set -euo pipefail

# 0. Safety cleanup trap: Always wipe token from process environment on exit
cleanup() {
    unset AGENTAUTHTOKEN 2>/dev/null || true
    unset AUTH_TOKEN 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo -e "\033[1;36m=====================================================\033[0m"
echo -e "\033[1;36m SOC Monitor Agent — Linux / Kali Installer          \033[0m"
echo -e "\033[1;36m=====================================================\033[0m"

# 1. Require root privileges
if [ "$(id -u)" -ne 0 ]; then
    echo -e "\033[1;31mError: Root privileges required. Please execute with sudo.\033[0m" >&2
    exit 1
fi

# 2. Check system architecture
ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
if [ "$ARCH" != "amd64" ] && [ "$ARCH" != "x86_64" ]; then
    echo -e "\033[1;31mError: Architecture '$ARCH' is not supported. Supported: amd64 / x86_64.\033[0m" >&2
    exit 1
fi

# 3. Parameter parsing: Support flags (--host, --port, --token), env vars, and positional args
COLLECTOR_HOST="${COLLECTOR_HOST:-}"
COLLECTOR_PORT="${COLLECTOR_PORT:-5000}"
AUTH_TOKEN="${AGENTAUTHTOKEN:-}"

while [ $# -gt 0 ]; do
    case "$1" in
        --host|-h)
            COLLECTOR_HOST="${2:-}"
            shift 2
            ;;
        --port|-p)
            COLLECTOR_PORT="${2:-5000}"
            shift 2
            ;;
        --token|-t)
            AUTH_TOKEN="${2:-}"
            shift 2
            ;;
        *)
            # Positional fallback: host [port] [token]
            if [ -z "$COLLECTOR_HOST" ]; then
                COLLECTOR_HOST="$1"
            elif [ "$COLLECTOR_PORT" = "5000" ] && [ -z "$AUTH_TOKEN" ]; then
                COLLECTOR_PORT="$1"
            elif [ -z "$AUTH_TOKEN" ]; then
                AUTH_TOKEN="$1"
            fi
            shift
            ;;
    esac
done

# If Collector Host not provided, prompt interactively
if [ -z "$COLLECTOR_HOST" ]; then
    echo -e "\033[1;33mEnter the SOC Monitor Collector IP or Hostname:\033[0m"
    echo -e "\033[0;37m(Use 192.168.56.1 for VirtualBox Host-Only or your SOC server IP. Do not use localhost unless running on the same machine)\033[0m"
    read -rp "Collector Host [192.168.56.1]: " INPUT_HOST
    COLLECTOR_HOST="${INPUT_HOST:-192.168.56.1}"
fi

# 4. Token Resolution: Use AGENTAUTHTOKEN or --token first; if missing, prompt securely
if [ -z "$AUTH_TOKEN" ]; then
    # Check if there is an existing config with a token
    if [ -f "/etc/soc-monitor-agent/agent.yml" ]; then
        echo -e "\033[1;32mExisting configuration detected. Press Enter to keep current configuration, or enter a new token.\033[0m"
        read -rsp "Enrollment Token (hidden): " INPUT_TOKEN
        echo ""
        if [ -n "$INPUT_TOKEN" ]; then
            AUTH_TOKEN="$INPUT_TOKEN"
        else
            AUTH_TOKEN=$(grep "auth_token:" /etc/soc-monitor-agent/agent.yml | head -n1 | awk '{print $2}' | tr -d '"'\'')
        fi
    else
        echo -e "\033[1;33mPlease enter your one-time enrollment token from the SOC Monitor dashboard:\033[0m"
        read -rsp "Enrollment Token (hidden): " AUTH_TOKEN
        echo ""
    fi
fi

if [ -z "$AUTH_TOKEN" ]; then
    echo -e "\033[1;31mError: Enrollment token cannot be empty. Aborting installation.\033[0m" >&2
    exit 1
fi

# 5. Check package availability
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEB_PKG=""

if [ -f "$SCRIPT_DIR/soc-monitor-agent_0.1.0_amd64.deb" ]; then
    DEB_PKG="$SCRIPT_DIR/soc-monitor-agent_0.1.0_amd64.deb"
elif [ -f "/tmp/soc-monitor-agent_0.1.0_amd64.deb" ]; then
    DEB_PKG="/tmp/soc-monitor-agent_0.1.0_amd64.deb"
else
    echo -e "\033[1;34mDownloading agent package from collector (http://${COLLECTOR_HOST}:${COLLECTOR_PORT}/api/v1/agents/download/linux)...\033[0m"
    DEB_PKG="/tmp/soc-monitor-agent_0.1.0_amd64.deb"
    if ! curl -sSL "http://${COLLECTOR_HOST}:${COLLECTOR_PORT}/api/v1/agents/download/linux" -o "$DEB_PKG"; then
        echo -e "\033[1;31mError: Failed to download agent package from http://${COLLECTOR_HOST}:${COLLECTOR_PORT}/api/v1/agents/download/linux\033[0m" >&2
        exit 1
    fi
fi

echo -e "\033[1;32mPackage found at '$DEB_PKG'. Installing via dpkg...\033[0m"
dpkg -i "$DEB_PKG" || apt-get install -f -y

# 6. Ensure state directories and permissions exist
mkdir -p /etc/soc-monitor-agent
mkdir -p /var/lib/soc-monitor-agent/state

# Ensure soc-agent user exists and belongs to system logging groups
if getent group systemd-journal > /dev/null 2>&1; then
    usermod -aG systemd-journal soc-agent 2>/dev/null || true
fi
if getent group adm > /dev/null 2>&1; then
    usermod -aG adm soc-agent 2>/dev/null || true
fi

# 7. Write configuration file atomically with journald enabled by default on systemd systems
HAS_JOURNALD="false"
if command -v journalctl > /dev/null 2>&1 && [ -d /run/systemd/system ]; then
    HAS_JOURNALD="true"
fi

CONFIG_FILE="/etc/soc-monitor-agent/agent.yml"
TMP_CONFIG=$(mktemp)

# If keeping existing token from file when none was provided:
if [ -z "$AUTH_TOKEN" ] && [ -f "$CONFIG_FILE" ]; then
    AUTH_TOKEN=$(grep "auth_token:" "$CONFIG_FILE" | head -n1 | awk '{print $2}' | tr -d '"'\''')
fi

cat <<EOF > "$TMP_CONFIG"
collector:
  host: "${COLLECTOR_HOST}"
  port: ${COLLECTOR_PORT}
  tls: false
  auth_token: "${AUTH_TOKEN}"

agent:
  id_file: "/var/lib/soc-monitor-agent/agent_id.txt"
  state_dir: "/var/lib/soc-monitor-agent/state"
  heartbeat_interval: 60
  buffer_max_events: 1000
  collection_interval: 5
  retry_max_delay: 60
  max_payload_bytes: 1048576
  journald_enabled: ${HAS_JOURNALD}

linux:
  log_paths:
    - "/var/log/auth.log"
    - "/var/log/syslog"
    - "/var/log/messages"
    - "/var/log/secure"
EOF

mv "$TMP_CONFIG" "$CONFIG_FILE"
chmod 0640 "$CONFIG_FILE"
chown root:soc-agent "$CONFIG_FILE"

chown -R soc-agent:soc-agent /var/lib/soc-monitor-agent
chmod 0750 /var/lib/soc-monitor-agent
chmod 0700 /var/lib/soc-monitor-agent/state

# 8. Deploy uninstaller script to /opt/soc-monitor-agent/uninstall-agent.sh
mkdir -p /opt/soc-monitor-agent
cat <<'UNINST_EOF' > /opt/soc-monitor-agent/uninstall-agent.sh
#!/usr/bin/env bash
# SOC Monitor Linux Agent Uninstaller
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: Root privileges required." >&2
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
    echo "Full cleanup completed."
else
    echo "Agent service and binaries removed."
    echo "Note: Local identity (/var/lib/soc-monitor-agent/agent_id.txt) and config preserved."
    echo "Server-side historical events and investigations remain intact."
    echo "To remove local identity and state files completely, rerun with: /opt/soc-monitor-agent/uninstall-agent.sh --full"
fi
echo "Uninstall complete."
UNINST_EOF
chmod 0755 /opt/soc-monitor-agent/uninstall-agent.sh

# 9. Enable and start systemd service
echo -e "\033[1;34mStarting soc-agent systemd service...\033[0m"
systemctl daemon-reload
systemctl enable soc-agent
systemctl restart soc-agent

# 10. Verify service status
sleep 2
if systemctl is-active --quiet soc-agent 2>/dev/null; then
    # Check journalctl for enrollment token rejection
    if journalctl -u soc-agent.service -n 25 --no-pager 2>/dev/null | grep -Eq "Invalid or expired enrollment code|401 Client Error|registration rejected"; then
        echo -e "\033[1;31mError: Enrollment failed: The server rejected the enrollment token as invalid or expired.\033[0m" >&2
        echo -e "\033[1;31mTokens are single-use and expire after 24 hours. Please generate a fresh token from the SOC Monitor dashboard.\033[0m" >&2
        exit 1
    fi
    echo -e "\033[1;32m=====================================================\033[0m"
    echo -e "\033[1;32m SOC Monitor Agent successfully installed and running!\033[0m"
    echo -e "\033[1;32m Service      : soc-agent.service (active)\033[0m"
    echo -e "\033[1;32m Collector    : ${COLLECTOR_HOST}:${COLLECTOR_PORT}\033[0m"
    echo -e "\033[1;32m Log Mode     : systemd-journal (enabled: ${HAS_JOURNALD})\033[0m"
    echo -e "\033[1;32m Uninstaller  : /opt/soc-monitor-agent/uninstall-agent.sh\033[0m"
    echo -e "\033[1;32m=====================================================\033[0m"
else
    # Check if running in WSL without active systemd
    if (grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]) && [ ! -d /run/systemd/system ]; then
        echo -e "\033[1;33m=====================================================\033[0m"
        echo -e "\033[1;33m Notice: WSL detected without active systemd.        \033[0m"
        echo -e "\033[1;33m Configuration and agent binaries installed cleanly. \033[0m"
        echo -e "\033[1;33m To run the agent process in background, execute:   \033[0m"
        echo -e "\033[1;37m   sudo /opt/soc-monitor-agent/soc-agent --config /etc/soc-monitor-agent/agent.yml &\033[0m"
        echo -e "\033[0;37m Or enable systemd in /etc/wsl.conf under [boot] systemd=true and restart WSL.\033[0m"
        echo -e "\033[1;33m=====================================================\033[0m"
    else
        echo -e "\033[1;31mWarning: soc-agent service is not active. Check journalctl -u soc-agent for diagnostics.\033[0m" >&2
        exit 1
    fi
fi
