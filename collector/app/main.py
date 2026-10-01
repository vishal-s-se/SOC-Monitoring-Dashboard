from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
import logging
import sys

from fastapi.middleware.cors import CORSMiddleware
from .routes import router

# Basic Setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("soc_monitor_collector")

app = FastAPI(title="SOC Monitor Collector", description="Event Ingestion API")

MAX_REQUEST_BODY_BYTES = 1_048_576


@app.middleware("http")
async def request_security_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            exceeds_limit = int(content_length) > MAX_REQUEST_BODY_BYTES
        except ValueError:
            return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "Invalid Content-Length"})
        if exceeds_limit:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"detail": "Request body too large"},
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception in collector: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal collector error."}
    )

app.include_router(router, prefix="/api/v1/agent")

@app.get("/health")
def health_check():
    logger.info("Collector health check accessed")
    return {"status": "ok", "service": "soc-monitor-collector"}

