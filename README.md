# SOC Monitor Platform

A lightweight, real-time Security Operations Center monitoring platform.

## Project Purpose
This platform aims to provide a modular, practical security monitoring solution capable of endpoint monitoring, event normalization, detection, and alerting across both Windows and Linux systems.

## Current Phase: Phase 1 (Foundation & Architecture)
This repository currently contains the Phase 1 implementation. It establishes:
- Monorepo project structure
- Technology stack decisions
- Backend and Frontend skeletons
- Configuration system
- Docker development foundation
- Basic testing and logging

**Limitations:** The current phase does NOT include actual telemetry collection, detection rules, database schemas, or full UI functionality. These are planned for future phases.

## Technology Stack
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Python, FastAPI, Pydantic
- **Database**: PostgreSQL (Planned)
- **Queue/Cache**: Redis (Planned)
- **Containerization**: Planned for Phase 9 (Currently Local Native)

## Repository Structure
- `/backend`: FastAPI backend application.
- `/frontend`: Next.js frontend application.
- `/collector`: Event ingestion service (skeleton).
- `/agents`: Agent implementation placeholders.
- `/docs`: Architecture and development documentation.

## Local Setup

This project runs directly on the host machine for development. You will need Node.js and Python 3.11+. Redis and PostgreSQL should be installed locally when required by future phases.

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Start the Backend:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
3. Start the Frontend (in a new terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Access the services:
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:8000`
   - Backend Health: `http://localhost:8000/health`
   - Collector API: `http://localhost:5000` (When running)

## Testing
Run backend tests (requires Python environment):
```bash
cd backend
pip install -r requirements.txt
pytest
```

## Future Phases
- Phase 2: Database schema, authentication, agent registration.
- Phase 3: Telemetry ingestion, real-time event streaming.
- Phase 4: Detection engine, alerting, MITRE ATT&CK mapping.
