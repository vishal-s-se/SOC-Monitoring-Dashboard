# SOC Monitor

A modular Security Operations Center monitoring platform for centralized endpoint telemetry collection, normalization, detection, correlation, alerting, investigation, and realtime visualization.

## Overview
SOC Monitor is a full-stack cybersecurity application designed to simulate a modern SIEM (Security Information and Event Management) platform. It provides a robust pipeline for ingesting agent telemetry, detecting threats through rule-based and behavioral correlation engines, and exposing findings to analysts via a realtime interactive dashboard.

## Key Capabilities
- **Windows Telemetry**: Collection of Windows Event Logs (`Application`, `System`, `Security`*) via a dedicated Python agent.
- **Linux Telemetry**: Structure for `auth.log` and `journalctl` tracking (Implemented, but runtime validation pending Windows constraints).
- **Agent Architecture**: Resilient local buffering, authentication, and heartbeat reporting.
- **Collector**: High-throughput FastAPI boundary dropping malformed telemetry and routing valid events.
- **Event Normalization**: Unified data schemas bridging varying log formats (e.g., Syslog vs. Windows Event Log).
- **Detection & Correlation**: Stateful engine evaluating single-event triggers and multi-stage behavioral patterns (e.g., brute force, unusual source).
- **PostgreSQL Storage**: Robust relational persistence for Raw Logs, Events, Alerts, and Investigations using asynchronous SQLAlchemy.
- **Alert Lifecycle**: Workflow management (`NEW` → `ACKNOWLEDGED` → `INVESTIGATING` → `RESOLVED`).
- **Investigations & MITRE ATT&CK**: Deep-dive graphs correlating Hosts, IPs, Users, and standard MITRE techniques.
- **Realtime Updates**: Instant WebSockets delivery to the Next.js React dashboard.
- **Quality Assured**: Fully covered by Pytest suites and Playwright E2E browser automation.

## Documentation
See the `docs/` folder for comprehensive manuals:
- [Architecture](docs/architecture.md)
- [Installation Guide](docs/installation.md)
- [Testing & Validation](docs/testing.md)
- [Detection & Correlation](docs/detections.md)
- [Demo Guide](docs/demo.md)

*Note: Windows Security Log collection requires Administrator privileges.*
