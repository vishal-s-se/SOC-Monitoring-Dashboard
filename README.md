# SOC Monitor Platform

A lightweight, real-time Security Operations Center monitoring platform for ingesting, normalizing, investigating, and reporting on security telemetry.

## Project Purpose
This platform provides a modular monitoring workflow for telemetry supplied by authorized producers. It preserves raw events, normalizes them, evaluates configured detection rules, and exposes alerts and investigations through an API and dashboard.

## Current Release State

The repository contains the PostgreSQL/Alembic data layer, authenticated FastAPI
backend, collector ingestion pipeline, detection and investigation models/API,
MITRE mapping surfaces, retention controls, and Next.js dashboard. Windows and
Linux endpoint agents are not included; see the [release checklist](docs/release-checklist.md).

## Technology Stack
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Python, FastAPI, Pydantic, SQLAlchemy, Alembic
- **Database**: PostgreSQL
- **Queue/Cache**: Redis configuration is retained, but the current request path
   does not require a Redis service.
- **Deployment**: Native local services; Docker is not required.

## Repository Structure
- `/backend`: FastAPI backend application.
- `/frontend`: Next.js frontend application.
- `/collector`: Authenticated event ingestion and normalization service.
- `/agents`: Reserved for endpoint agent implementations; no Windows or Linux agent is included in this release.
- `/docs`: Architecture and development documentation.

## Local Setup

This project runs directly on the host machine. You will need Node.js, Python
3.11+, and PostgreSQL.

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
   uvicorn backend.app.main:app --reload --port 8000
   ```
5. Start the Frontend (in a new terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
6. Access the services:
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:8000`
   - Backend Health: `http://localhost:8000/health`
   - Database Health: `http://localhost:8000/health/db`
   - Collector API: `http://localhost:5000` (When running)

## Documentation

- [Documentation overview](docs/README.md)
- [Installation and deployment](docs/deployment.md)
- [API reference](docs/api.md)
- [Authorized SOC lab guide](docs/soc-lab.md)
- [Release checklist](docs/release-checklist.md)
