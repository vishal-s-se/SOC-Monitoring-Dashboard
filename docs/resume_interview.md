# Career Portfolio & Interview Guide

## Resume Description

**SOC Monitor Platform** | *Python, FastAPI, Next.js, PostgreSQL, WebSockets*
*A modular Security Information and Event Management (SIEM) platform for centralized telemetry and threat detection.*
- Engineered a distributed architecture separating high-throughput ingestion (Collector) from analytics (Backend) via async FastAPI and PostgreSQL.
- Developed a cross-platform Python endpoint agent utilizing local buffering and OS-level log querying (`win32evtlog`).
- Implemented a stateful correlation engine mapping behavioral patterns (e.g., brute force, lateral movement) to MITRE ATT&CK techniques.
- Built a realtime Next.js investigation dashboard featuring WebSocket telemetry streaming and Playwright E2E test coverage (100% pass rate).

## Interview QA

**"What did you build and why?"**
I built a full-stack SIEM to solve the problem of fragmented log analysis. I wanted to understand the engineering behind enterprise security tools, specifically how raw OS logs are transformed into actionable behavioral alerts in realtime.

**"How does an event become an alert?"**
The Agent captures a log and sends it to the Collector. The Collector validates the envelope and persists it. The Backend continuously polls new events, runs them against static rules and historical correlation windows (like checking if an IP is an "unusual source" based on a 7-day baseline). If a threshold is met, it synthesizes an Alert and broadcasts it to the UI via WebSockets.

**"Why PostgreSQL and DBPollingTransport?"**
PostgreSQL provided robust relational integrity for complex threat investigations. Instead of introducing Kafka/Redis immediately (which adds overhead), I used `DBPollingTransport` to allow the detection engine to query the database asynchronously, keeping the architecture simple but reliable for lab-scale throughput.

**"How did you prevent duplicate alerts?"**
The correlation engine aggregates triggers into a single `Synthetic Event` based on time windows. If the same rule fires for the same host, the Alert's `Occurrence Count` is incremented rather than creating a new database row, preventing alert fatigue.

## Screenshot Checklist
1. Architecture Diagram
2. Overview Dashboard (Metrics)
3. Live Events (Realtime feed)
4. Alert Details & Status change
5. Investigation Timeline (Host/IP graphs)
6. Raw Log Evidence JSON
7. MITRE ATT&CK Matrix
8. Terminal output showing 17/17 Playwright E2E passing.
