from fastapi import FastAPI
import logging
import sys

from fastapi.middleware.cors import CORSMiddleware

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

@app.get("/health")
def health_check():
    logger.info("Collector health check accessed")
    return {"status": "ok", "service": "soc-monitor-collector"}
