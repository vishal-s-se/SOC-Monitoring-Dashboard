from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .core.config import settings
from .core.logging import logger

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

# Future API router inclusion placeholder
# from app.api.v1.api import api_router
# app.include_router(api_router, prefix=settings.API_V1_STR)
