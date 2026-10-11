$ErrorActionPreference = "Stop"

if (-not (Get-Command pyinstaller -ErrorAction SilentlyContinue)) {
    throw "PyInstaller is required. Install it in the build environment before running this script."
}

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    pyinstaller --clean --noconfirm packaging/soc-agent.spec
} finally {
    Pop-Location
}