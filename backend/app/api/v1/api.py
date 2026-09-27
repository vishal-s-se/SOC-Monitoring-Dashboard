from fastapi import APIRouter

from backend.app.api.v1.endpoints import (
    events,
    raw_logs,
    alerts,
    agents,
    hosts,
    detections,
    ws
)

api_router = APIRouter()

api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(raw_logs.router, prefix="/raw_logs", tags=["raw_logs"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(hosts.router, prefix="/hosts", tags=["hosts"])
api_router.include_router(detections.router, prefix="/detections", tags=["detections"])
api_router.include_router(ws.router, prefix="/ws", tags=["websocket"])
