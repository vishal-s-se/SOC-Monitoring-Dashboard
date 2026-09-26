# Database Development Guide

This guide explains how to interact with the database layer locally.

## Local Setup
The project relies on PostgreSQL running locally. No Docker is used for the database in Phase 2.

### Environment Configuration
Copy `.env.example` to `.env` and set `DATABASE_URL`.
Example:
`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/soc_monitor`

### Running Migrations
Alembic is used to manage database schema changes.

#### Apply Migrations (Update DB to latest)
```bash
cd backend
alembic upgrade head
```

#### Create New Migration
```bash
cd backend
alembic revision --autogenerate -m "description of changes"
```

#### Rollback Migration
```bash
cd backend
alembic downgrade -1
```

## Testing
Tests use pytest. Run them with:
```bash
cd backend
pytest tests/test_db.py -v
```

## Troubleshooting
- **Connection Refused**: Ensure PostgreSQL is installed and running on port 5432, and the credentials in `.env` are correct.
- **Missing Tables**: Run `alembic upgrade head`.
