# Installation

## Windows

1. Install Python 3.11 or newer and create a virtual environment.
2. Run `python -m pip install -r requirements.txt` from the repository root.
3. Copy `agent.yml.example` to `agent.yml` and set the collector host, port, TLS mode, and authentication token.
4. Run `python src/main.py` in a service manager or foreground console. Use `python src/main.py --test-event` for a one-event verification.
5. Confirm registration, heartbeat, and event delivery in the collector logs.
6. Stop with `Ctrl+C`, then remove the virtual environment and local configuration to uninstall.

For a distributable executable, install PyInstaller and run `scripts/build_windows.ps1` on Windows. Configure `dist/soc-agent.exe` with a local `agent.yml`; the build output is not part of source control.

## Linux

1. Install Python 3.11 or newer and the system packages needed to read the selected logs.
2. Create `/opt/soc-monitor-agent`, copy the repository there, and create `/opt/soc-monitor-agent/.venv`.
3. Run `/opt/soc-monitor-agent/.venv/bin/python -m pip install -r /opt/soc-monitor-agent/requirements.txt`.
4. Create `/etc/soc-monitor-agent/agent.yml` from `agent.yml.example`; set the collector address, TLS, and authentication. Put `SOC_AGENT_AUTH_TOKEN` in `/etc/soc-monitor-agent/agent.env` with mode `0600` when not using the YAML token.
5. Create the service account and state directory: `sudo useradd --system --home /var/lib/soc-monitor-agent --shell /usr/sbin/nologin soc-agent` and `sudo install -d -o soc-agent -g soc-agent /var/lib/soc-monitor-agent`.
6. Install the unit with `sudo install -m 0644 packaging/soc-agent.service /etc/systemd/system/soc-agent.service`.
7. Run `sudo systemctl daemon-reload`, `sudo systemctl enable --now soc-agent`, then `sudo systemctl status soc-agent`.
8. Review logs with `sudo journalctl -u soc-agent -f`. Stop or restart with `sudo systemctl stop soc-agent` or `sudo systemctl restart soc-agent`.
9. Uninstall with `sudo systemctl disable --now soc-agent`, remove the unit and `/opt/soc-monitor-agent`, then remove `/etc/soc-monitor-agent` and the service account when no longer needed.

The service runs with a dedicated least-privilege account. Reading protected logs may require adding that account to the platform's log-reading group; do not run the agent as root solely to bypass permissions.