# Troubleshooting Guide

- **Error: `[winerror 10048] only one usage of each socket address is normally permitted`**
  *Cause*: Port 8000/5000 is already in use (usually a ghost Python process).
  *Fix*: `Stop-Process -Name python -Force`

- **Error: `Access is denied.` (Windows Agent)**
  *Cause*: Agent attempted to read the `Security` event log without Admin privileges.
  *Fix*: Right-click Terminal -> Run as Administrator.

- **Error: Playwright tests failing on `toBeVisible()`**
  *Cause*: Overlapping test database states from background dev servers.
  *Fix*: Stop all backend servers, ensure `run_e2e.ps1` runs isolated.
