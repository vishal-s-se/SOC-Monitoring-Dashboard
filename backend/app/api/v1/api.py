from fastapi import APIRouter

from backend.app.api.v1.endpoints import (
    investigations,
    events,
    raw_logs,
    alerts,
    agents,
    hosts,
    detections,
    ws,
    timeline,
    mitre,
    ip_investigation,
    host_investigation,
    user_context,
    event_context,
    alert_context,
    investigation_intelligence
)

api_router = APIRouter()

api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(raw_logs.router, prefix="/raw_logs", tags=["raw_logs"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(hosts.router, prefix="/hosts", tags=["hosts"])
api_router.include_router(detections.router, prefix="/detections", tags=["detections"])
api_router.include_router(ws.router, prefix="/ws", tags=["websocket"])
api_router.include_router(investigations.router, prefix="/investigations", tags=["investigations"])
api_router.include_router(investigation_intelligence.router, prefix="/investigations", tags=["investigation-intelligence"])
api_router.include_router(timeline.router, prefix="/attack-timeline", tags=["attack-timeline"])
api_router.include_router(mitre.router, prefix="/mitre", tags=["mitre"])
api_router.include_router(ip_investigation.router, prefix="/ip-investigation", tags=["ip-investigation"])
api_router.include_router(host_investigation.router, prefix="/host-investigation", tags=["host-investigation"])
api_router.include_router(user_context.router, prefix="/user-context", tags=["user-context"])
api_router.include_router(event_context.router, prefix="/events", tags=["event-context"])
api_router.include_router(alert_context.router, prefix="/alerts", tags=["alert-context"])
