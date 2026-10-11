#!/bin/bash
set -e

echo "Installing dependencies..."
python3 -m pip install --break-system-packages -r requirements.txt

# Verify pyinstaller is available
if ! command -v pyinstaller &> /dev/null; then
    echo "PyInstaller not found. Attempting to install via pip..."
    python3 -m pip install --break-system-packages pyinstaller
fi

# Go to project root
cd "$(dirname "$0")/.."

echo "Building standalone binary with PyInstaller..."
rm -rf build/ dist/soc-agent
pyinstaller --clean -F --name soc-agent --hidden-import yaml --hidden-import requests src/main.py

echo "Preparing Debian package structure in /tmp to avoid WSL permission issues..."
DEB_DIR="/tmp/deb_build"
rm -rf "$DEB_DIR"
mkdir -p "$DEB_DIR/opt/soc-monitor-agent"
mkdir -p "$DEB_DIR/etc/soc-monitor-agent"
mkdir -p "$DEB_DIR/lib/systemd/system"
mkdir -p "$DEB_DIR/DEBIAN"

echo "Copying files..."
cp dist/soc-agent "$DEB_DIR/opt/soc-monitor-agent/"
cp packaging/linux_agent.yml "$DEB_DIR/etc/soc-monitor-agent/agent.yml"
cp packaging/soc-agent.service "$DEB_DIR/lib/systemd/system/"
cp packaging/debian/DEBIAN/* "$DEB_DIR/DEBIAN/"

echo "Setting permissions..."
chmod -R 0755 "$DEB_DIR"
chmod 0755 "$DEB_DIR/DEBIAN/postinst"
chmod 0755 "$DEB_DIR/DEBIAN/prerm"
chmod 0755 "$DEB_DIR/DEBIAN/postrm"
chmod 0644 "$DEB_DIR/DEBIAN/conffiles"
chmod 0644 "$DEB_DIR/DEBIAN/control"

echo "Building Debian package..."
dpkg-deb --build "$DEB_DIR" dist/soc-monitor-agent_0.1.0_amd64.deb

echo "Done! Package is at dist/soc-monitor-agent_0.1.0_amd64.deb"
