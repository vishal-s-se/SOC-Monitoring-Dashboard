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

from fastapi.responses import FileResponse
import os

@app.get("/api/v1/agents/download/{os_type:path}")
async def download_agent(os_type: str):
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../artifacts"))
    if os_type == "windows":
        file_path = os.path.join(base_dir, "soc-agent-windows.zip")
        filename = "soc-agent-windows.zip"
    elif os_type == "linux":
        file_path = os.path.join(base_dir, "soc-monitor-agent_0.1.0_amd64.deb")
        filename = "soc-monitor-agent_0.1.0_amd64.deb"
    elif os_type in ["script/windows/install", "install-agent.ps1"]:
        file_path = os.path.join(base_dir, "install-agent.ps1")
        filename = "install-agent.ps1"
    elif os_type in ["script/windows/uninstall", "uninstall-agent.ps1"]:
        file_path = os.path.join(base_dir, "uninstall-agent.ps1")
        filename = "uninstall-agent.ps1"
    elif os_type in ["script/linux/install", "install-agent.sh"]:
        file_path = os.path.join(base_dir, "install-agent.sh")
        filename = "install-agent.sh"
    elif os_type in ["script/linux/uninstall", "uninstall-agent.sh"]:
        file_path = os.path.join(base_dir, "uninstall-agent.sh")
        filename = "uninstall-agent.sh"
    elif os_type in ["checksums", "sha256sums", "SHA256SUMS"]:
        file_path = os.path.join(base_dir, "SHA256SUMS")
        filename = "SHA256SUMS"
    elif os_type == "Install-SOCAgent.ps1":
        file_path = os.path.join(base_dir, "Install-SOCAgent.ps1")
        filename = "Install-SOCAgent.ps1"
    elif os_type == "Uninstall-SOCAgent.ps1":
        file_path = os.path.join(base_dir, "Uninstall-SOCAgent.ps1")
        filename = "Uninstall-SOCAgent.ps1"
    else:
        return JSONResponse(status_code=400, content={"detail": "Invalid OS type"})

    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"detail": "Artifact not found"})
    return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream")

@app.get("/health")
def health_check():
    logger.info("Collector health check accessed")
    return {"status": "ok", "service": "soc-monitor-collector"}

