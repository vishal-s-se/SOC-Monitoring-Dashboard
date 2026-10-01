from fastapi import APIRouter, Depends

from backend.app.api.deps import enforce_method_roles
from backend.app.api.v1.endpoints import (
    health,
    reports,
    retention,
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
    investigation_intelligence,
    analytics,
    auth,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

secured_router = APIRouter(dependencies=[Depends(enforce_method_roles)])
secured_router.include_router(health.router, prefix="/health", tags=["health"])
secured_router.include_router(reports.router, prefix="/reports", tags=["reports"])
secured_router.include_router(retention.router, prefix="/retention", tags=["retention"])
secured_router.include_router(events.router, prefix="/events", tags=["events"])
secured_router.include_router(raw_logs.router, prefix="/raw_logs", tags=["raw_logs"])
secured_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
secured_router.include_router(agents.router, prefix="/agents", tags=["agents"])
secured_router.include_router(hosts.router, prefix="/hosts", tags=["hosts"])
secured_router.include_router(detections.router, prefix="/detections", tags=["detections"])
secured_router.include_router(investigations.router, prefix="/investigations", tags=["investigations"])
secured_router.include_router(investigation_intelligence.router, prefix="/investigations", tags=["investigation-intelligence"])
secured_router.include_router(timeline.router, prefix="/attack-timeline", tags=["attack-timeline"])
secured_router.include_router(mitre.router, prefix="/mitre", tags=["mitre"])
secured_router.include_router(ip_investigation.router, prefix="/ip-investigation", tags=["ip-investigation"])
secured_router.include_router(host_investigation.router, prefix="/host-investigation", tags=["host-investigation"])
secured_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
secured_router.include_router(user_context.router, prefix="/user-context", tags=["user-context"])
secured_router.include_router(event_context.router, prefix="/events", tags=["event-context"])
secured_router.include_router(alert_context.router, prefix="/alerts", tags=["alert-context"])
api_router.include_router(secured_router)

# WebSocket auth is enforced inside the endpoint (query token), not via HTTP bearer deps.
api_router.include_router(ws.router, prefix="/ws", tags=["websocket"])
