import io
import csv
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from backend.app.core.filenames import parse_ip_or_400, safe_filename
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from backend.app.db.session import get_db
from backend.app.models.event import Event
from backend.app.models.alert import Alert
from backend.app.models.investigation import Investigation
from backend.app.models.host import Host
from backend.app.models.agent import Agent
from backend.app.schemas.report import (
    DailySecuritySummary, ReportMetadata, HostReport, IPReport, 
    AlertReport, TimelineReport, AuthReport, FirewallReport
)

router = APIRouter()

def generate_csv_response(data: list, filename: str):
    output = io.StringIO()
    if not data:
        writer = csv.writer(output)
        writer.writerow(["No Data"])
    else:
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        for row in data:
            writer.writerow(row)

    output.seek(0)
    safe_name = safe_filename(filename)
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f'attachment; filename="{safe_name}"'
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@router.get("/daily-summary")
async def get_daily_summary(
    hours: int = Query(24, ge=1, le=168),
    format: str = Query("json", description="json or csv"),
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    metadata = ReportMetadata(
        report_type="Daily Security Summary",
        generated_at=now,
        time_range_hours=hours,
        filters={}
    )
    
    events_count = (await db.execute(select(func.count(Event.id)).where(Event.timestamp >= start_time))).scalar() or 0
    alerts_count = (await db.execute(select(func.count(Alert.id)).where(Alert.first_seen >= start_time))).scalar() or 0
    inv_count = (await db.execute(select(func.count(Investigation.id)).where(Investigation.created_at >= start_time, Investigation.status != 'CLOSED'))).scalar() or 0
    
    hosts_count = (await db.execute(select(func.count(Host.id)).where(Host.status == "ONLINE"))).scalar() or 0
    agents_count = (await db.execute(select(func.count(Agent.id)).where(Agent.status == "ONLINE"))).scalar() or 0
    
    # Auth
    auth_success = (await db.execute(select(func.count(Event.id)).where(Event.timestamp >= start_time, Event.event_category == "authentication", Event.action == "success"))).scalar() or 0
    auth_failure = (await db.execute(select(func.count(Event.id)).where(Event.timestamp >= start_time, Event.event_category == "authentication", Event.action == "failure"))).scalar() or 0
    
    # Firewall
    fw_allow = (await db.execute(select(func.count(Event.id)).where(Event.timestamp >= start_time, Event.event_category == "network", Event.action == "allow"))).scalar() or 0
    fw_block = (await db.execute(select(func.count(Event.id)).where(Event.timestamp >= start_time, Event.event_category == "network", Event.action == "block"))).scalar() or 0
    
    # Category agg
    cat_res = await db.execute(select(Event.event_category, func.count(Event.id)).where(Event.timestamp >= start_time).group_by(Event.event_category))
    events_by_cat = {row[0] or "unknown": row[1] for row in cat_res.all()}
    
    sev_res = await db.execute(select(Alert.severity, func.count(Alert.id)).where(Alert.first_seen >= start_time).group_by(Alert.severity))
    alerts_by_sev = {row[0] or "unknown": row[1] for row in sev_res.all()}
    
    if format == "csv":
        flat_data = [
            {"Metric": "Total Events", "Value": events_count},
            {"Metric": "Total Alerts", "Value": alerts_count},
            {"Metric": "Active Investigations", "Value": inv_count},
            {"Metric": "Auth Successes", "Value": auth_success},
            {"Metric": "Auth Failures", "Value": auth_failure},
            {"Metric": "Firewall Allowed", "Value": fw_allow},
            {"Metric": "Firewall Blocked", "Value": fw_block},
            {"Metric": "Active Hosts", "Value": hosts_count},
            {"Metric": "Active Agents", "Value": agents_count}
        ]
        for k, v in events_by_cat.items():
            flat_data.append({"Metric": f"Category: {k}", "Value": v})
        return generate_csv_response(flat_data, "daily_summary.csv")
    
    return DailySecuritySummary(
        metadata=metadata,
        total_events=events_count,
        events_by_category=events_by_cat,
        total_alerts=alerts_count,
        alerts_by_severity=alerts_by_sev,
        investigations_active=inv_count,
        auth_successes=auth_success,
        auth_failures=auth_failure,
        firewall_allowed=fw_allow,
        firewall_blocked=fw_block,
        active_hosts=hosts_count,
        active_agents=agents_count
    )

@router.get("/host/{host_id}")
async def get_host_report(
    host_id: int,
    hours: int = Query(24, ge=1, le=168),
    format: str = Query("json", description="json or csv"),
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    host = (await db.execute(select(Host).where(Host.id == host_id))).scalars().first()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
        
    events = (await db.execute(select(Event).where(Event.host_id == host_id, Event.timestamp >= start_time).limit(1000))).scalars().all()
    alerts = (await db.execute(select(Alert).where(Alert.host_id == host_id, Alert.first_seen >= start_time).limit(100))).scalars().all()
    
    if format == "csv":
        flat = [{"Event_ID": e.event_id, "Timestamp": e.timestamp, "Type": e.event_type, "Category": e.event_category} for e in events]
        return generate_csv_response(flat, f"host_{host_id}_report.csv")
        
    return HostReport(
        metadata=ReportMetadata(report_type="Host Report", generated_at=now, time_range_hours=hours, filters={"host_id": host_id}),
        host_id=host.id,
        hostname=host.hostname,
        operating_system=host.operating_system,
        ip_address=host.ip_address,
        total_events=len(events),
        alerts=[{"id": a.id, "title": a.title, "severity": a.severity} for a in alerts],
        auth_activity=[{"type": e.event_type, "time": e.timestamp} for e in events if e.event_category == "authentication"],
        timeline_summary=[]
    )

@router.get("/ip/{ip}")
async def get_ip_report(
    ip: str,
    hours: int = Query(24, ge=1, le=168),
    format: str = Query("json", description="json or csv"),
    db: AsyncSession = Depends(get_db)
):
    try:
        ip = parse_ip_or_400(ip)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP address")

    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)

    stmt = select(Event).where(Event.timestamp >= start_time).where((Event.source_ip == ip) | (Event.destination_ip == ip)).limit(1000)
    events = (await db.execute(stmt)).scalars().all()
    
    if format == "csv":
        flat = [{"Event_ID": e.event_id, "Timestamp": e.timestamp, "Source_IP": e.source_ip, "Destination_IP": e.destination_ip} for e in events]
        return generate_csv_response(flat, f"ip_{ip}_report.csv")
        
    role_src = sum(1 for e in events if e.source_ip == ip)
    role_dst = sum(1 for e in events if e.destination_ip == ip)
    
    hosts = list(set([e.hostname for e in events if e.hostname]))
    
    return IPReport(
        metadata=ReportMetadata(report_type="IP Report", generated_at=now, time_range_hours=hours, filters={"ip": ip}),
        ip_address=ip,
        role_summary={"source": role_src, "destination": role_dst},
        related_events=[{"id": e.event_id, "type": e.event_type, "time": e.timestamp} for e in events],
        related_alerts=[],
        related_hosts=hosts
    )

@router.get("/timeline")
async def get_timeline_report(
    hours: int = Query(24, ge=1, le=168),
    format: str = Query("json", description="json or csv"),
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    events = (await db.execute(select(Event).where(Event.timestamp >= start_time).order_by(Event.timestamp.asc()).limit(500))).scalars().all()
    alerts = (await db.execute(select(Alert).where(Alert.first_seen >= start_time).order_by(Alert.first_seen.asc()).limit(500))).scalars().all()
    
    nodes = []
    for e in events:
        nodes.append({"id": f"evt_{e.event_id}", "time": e.timestamp, "type": "EVENT", "desc": e.event_type, "provenance": "DIRECT"})
    for a in alerts:
        nodes.append({"id": f"alt_{a.id}", "time": a.first_seen, "type": "ALERT", "desc": a.title, "provenance": "CORRELATED"})
        
    nodes.sort(key=lambda x: x["time"])
    nodes = nodes[:1000]
    
    if format == "csv":
        flat = [{"Node_ID": n["id"], "Timestamp": n["time"], "Entity_Type": n["type"], "Description": n["desc"], "Provenance": n["provenance"]} for n in nodes]
        return generate_csv_response(flat, "timeline_report.csv")
        
    return TimelineReport(
        metadata=ReportMetadata(report_type="Attack Timeline Report", generated_at=now, time_range_hours=hours, filters={}),
        timeline_entries=nodes
    )

@router.get("/alert/{alert_id}")
async def get_alert_report(
    alert_id: int,
    format: str = Query("json", description="json or csv"),
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    alert = (await db.execute(select(Alert).where(Alert.id == alert_id))).scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    if format == "csv":
        flat = [{"Alert_ID": alert.id, "Title": alert.title, "Severity": alert.severity, "Status": alert.status}]
        return generate_csv_response(flat, f"alert_{alert_id}_report.csv")
        
    return AlertReport(
        metadata=ReportMetadata(report_type="Alert Report", generated_at=now, time_range_hours=0, filters={"alert_id": alert_id}),
        alert_id=alert.id,
        title=alert.title,
        severity=alert.severity,
        status=alert.status,
        host_id=alert.host_id,
        evidence=[],
        mitre_mappings=[]
    )

@router.get("/authentication")
async def get_auth_report(
    hours: int = Query(24, ge=1, le=168),
    format: str = Query("json", description="json or csv"),
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    events = (await db.execute(select(Event).where(Event.timestamp >= start_time, Event.event_category == "authentication").limit(1000))).scalars().all()
    
    if format == "csv":
        flat = [{"Event_ID": e.event_id, "Timestamp": e.timestamp, "Action": e.action, "Username": e.username} for e in events]
        return generate_csv_response(flat, "authentication_report.csv")
        
    successes = sum(1 for e in events if e.action == "success")
    failures = sum(1 for e in events if e.action == "failure")
    
    return AuthReport(
        metadata=ReportMetadata(report_type="Authentication Report", generated_at=now, time_range_hours=hours, filters={}),
        successful_logins=successes,
        failed_logins=failures,
        activity=[{"id": e.event_id, "time": e.timestamp, "action": e.action, "user": e.username} for e in events]
    )

@router.get("/firewall")
async def get_firewall_report(
    hours: int = Query(24, ge=1, le=168),
    format: str = Query("json", description="json or csv"),
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    events = (await db.execute(select(Event).where(Event.timestamp >= start_time, Event.event_category == "network").limit(1000))).scalars().all()
    
    if format == "csv":
        flat = [{"Event_ID": e.event_id, "Timestamp": e.timestamp, "Action": e.action, "Protocol": e.protocol} for e in events]
        return generate_csv_response(flat, "firewall_report.csv")
        
    allowed = sum(1 for e in events if e.action == "allow")
    blocked = sum(1 for e in events if e.action == "block")
    rejected = sum(1 for e in events if e.action == "reject")
    
    return FirewallReport(
        metadata=ReportMetadata(report_type="Firewall Report", generated_at=now, time_range_hours=hours, filters={}),
        allowed=allowed,
        blocked=blocked,
        rejected=rejected,
        activity=[{"id": e.event_id, "time": e.timestamp, "action": e.action} for e in events]
    )
