# SOC Monitor Platform

A lightweight, real-time Security Operations Center monitoring platform.

## Project Purpose
This platform aims to provide a modular, practical security monitoring solution capable of endpoint monitoring, event normalization, detection, and alerting across both Windows and Linux systems.

## Current Phase: Phase 2 (Database & Core Backend)
This repository currently contains the Phase 2 implementation. It establishes:
- PostgreSQL database integration
- SQLAlchemy ORM and Alembic migrations
- Core entities (Hosts, Agents, Raw Logs, Events, Heartbeats)
- Database health checks and connection management
- Monorepo project structure
- Configuration system

**Limitations:** The current phase does NOT include actual telemetry collection, detection rules, or full UI functionality. These are planned for future phases.

## Technology Stack
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Python, FastAPI, Pydantic, SQLAlchemy, Alembic
- **Database**: PostgreSQL
- **Queue/Cache**: Redis (Planned)
- **Containerization**: Local Native (Docker planned for Phase 9)

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
2. Start the Database:
   - Ensure PostgreSQL is installed and running locally on port 5432.
   - Update `DATABASE_URL` in `.env` if necessary.

3. Run Database Migrations:
   ```bash
   .\backend\venv\Scripts\alembic.exe upgrade head
   ```

4. Start the Backend:
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
   - Database Health: `http://localhost:8000/health/db`
   - Collector API: `http://localhost:5000` (When running)

## Testing
Run backend tests (requires Python environment and local PostgreSQL):
```bash
cd backend
pip install -r requirements.txt
pytest tests/test_db.py -v
```

## Future Phases
- Phase 3: Telemetry ingestion, real-time event streaming (Agent & Collector).
- Phase 4: Detection engine, alerting, MITRE ATT&CK mapping.
- Phase 5: Incident response and investigation workflows.
