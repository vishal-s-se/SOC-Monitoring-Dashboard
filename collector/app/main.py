from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import logging
import sys

from fastapi.middleware.cors import CORSMiddleware
from collector.app.routes import router

# Basic Setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("soc_monitor_collector")

app = FastAPI(title="SOC Monitor Collector", description="Event Ingestion API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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

