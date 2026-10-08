# Project Report: SOC Monitor

## 1. Abstract
SOC Monitor is a modular Security Operations Center platform designed to emulate modern SIEM capabilities. It provides an end-to-end telemetry pipeline from remote agents to a realtime analytical dashboard, enabling threat detection, behavioral correlation, and incident investigation.

## 2. Problem Statement & Existing Problem
Modern networks generate vast amounts of disparate log data across various OS ecosystems. Security analysts struggle to correlate these events in realtime without expensive, highly-complex enterprise SIEMs. Disconnected logs lead to alert fatigue and missed lateral movement.

## 3. Proposed System & Objectives
Develop a lightweight, high-performance platform capable of:
1. Centralized ingestion of normalized logs.
2. Automated behavioral correlation to reduce noise.
3. Realtime visualization without page refreshing.

## 4. Architecture
The architecture physically separates Ingestion (Collector:5000), Storage (PostgreSQL:5432), Analysis (Backend:8000), and Presentation (Next.js:3000), guaranteeing that compromised endpoints cannot directly query the database or dashboard.

## 5. Technologies Used
- **Backend/Collector**: Python, FastAPI, SQLAlchemy (Asyncpg).
- **Frontend**: Next.js (React), TailwindCSS, WebSockets.
- **Agent**: Python, PyInstaller, `win32evtlog`.
- **Testing**: Pytest, Playwright.

## 6. Event Processing & Correlation
Events are normalized from raw JSON payloads. The Threat Engine utilizes a stateless detection mechanism for explicit IoCs and a stateful `DBPollingTransport` correlation engine to detect baseline deviations (e.g., unusual login sources, brute forcing).

## 7. Results & Testing
The system successfully processes telemetry seamlessly. Validation yielded 100% pass rates across 113 rigorous static and end-to-end tests. WebSockets consistently delivered sub-second updates to the frontend browser.

## 8. Limitations & Future Improvements
- **Linux Verification**: Requires deployment to a dedicated Debian/Ubuntu cluster.
- **Future Improvements**: Cloud scalability via Kafka messaging queues and Docker orchestration for horizontal scaling.

## 9. Conclusion
SOC Monitor successfully fulfills its objectives as a comprehensive threat intelligence platform, offering a highly stable foundation for cybersecurity learning, lab environments, and analyst workflows.
