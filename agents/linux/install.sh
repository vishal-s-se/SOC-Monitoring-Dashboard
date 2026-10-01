#!/usr/bin/env sh
set -eu

INSTALL_DIR="${SOC_AGENT_INSTALL_DIR:-/opt/soc-agent}"
SERVICE_USER="${SOC_AGENT_SERVICE_USER:-soc-agent}"
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

mkdir -p "$INSTALL_DIR"
cp -r "$SOURCE_DIR/agents" "$INSTALL_DIR/"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
printf '%s\n' "Installed agent files in $INSTALL_DIR. Configure SOC_AGENT_* and add a systemd unit for your distribution."
