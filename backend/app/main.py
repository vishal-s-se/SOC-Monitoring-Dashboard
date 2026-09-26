from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from .core.config import settings
from .core.logging import logger
from .db.session import get_db

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="SOC Monitor Backend API Phase 1",
)

# CORS Foundation
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Basic Error Handling Foundation
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."}
    )

@app.get("/")
def root():
    logger.info("Root endpoint accessed")
    return {"message": "SOC Monitor API is running"}

@app.get("/health")
def health_check():
    logger.info("Health check endpoint accessed")
    return {
        "status": "ok",
        "service": "soc-monitor-backend"
    }

@app.get("/health/db")
async def db_health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "service": "database"}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "error", "service": "database", "detail": "Database unavailable"}
        )

from backend.app.api.alerts import router as alerts_router
app.include_router(alerts_router, prefix=settings.API_V1_STR)

# Future API router inclusion placeholder
# from backend.app.api.v1.api import api_router
# app.include_router(api_router, prefix=settings.API_V1_STR)
