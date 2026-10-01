# Development Guide

## Prerequisites
- Node.js (for local frontend development)
- Python 3.11+ (for local backend/collector development)
- PostgreSQL
- Redis is optional for the current request path.

## Environment Setup
1. Clone the repository.
2. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```

## Development Commands

### Using Local Host (Required)
This project runs directly on the local machine. Docker is not required by the current repository.

### Local Backend Development
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

### Local Frontend Development
```bash
cd frontend
npm install
npm run dev
```

## Testing Commands
Backend (FastAPI):
```bash
cd backend
pytest
```

## Configuration
All configuration should be driven by environment variables. See `.env.example` for available options. Never hardcode secrets in the codebase.

## Coding Conventions
- **Python**: Use type hints, modular structure, small functions. Follow PEP 8.
- **Frontend**: Use Next.js App Router, functional components, hooks.
- **Security**: Validate all inputs, don't expose stack traces.
