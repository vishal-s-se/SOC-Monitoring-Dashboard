from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime

class ReportMetadata(BaseModel):
    report_type: str
    generated_at: datetime
    time_range_hours: int
    filters: Dict[str, Any]

class DailySecuritySummary(BaseModel):
    metadata: ReportMetadata
    total_events: int
    events_by_category: Dict[str, int]
    total_alerts: int
    alerts_by_severity: Dict[str, int]
    investigations_active: int
    auth_successes: int
    auth_failures: int
    firewall_allowed: int
    firewall_blocked: int
    active_hosts: int
    active_agents: int

class HostReport(BaseModel):
    metadata: ReportMetadata
    host_id: int
    hostname: str
    operating_system: Optional[str]
    ip_address: Optional[str]
    total_events: int
    alerts: List[Dict[str, Any]]
    auth_activity: List[Dict[str, Any]]
    timeline_summary: List[Dict[str, Any]]

class IPReport(BaseModel):
    metadata: ReportMetadata
    ip_address: str
    role_summary: Dict[str, int]
    related_events: List[Dict[str, Any]]
    related_alerts: List[Dict[str, Any]]
    related_hosts: List[str]

class AlertReport(BaseModel):
    metadata: ReportMetadata
    alert_id: int
    title: str
    severity: str
    status: str
    host_id: Optional[int]
    evidence: List[Dict[str, Any]]
    mitre_mappings: List[Dict[str, Any]]

class TimelineReport(BaseModel):
    metadata: ReportMetadata
    timeline_entries: List[Dict[str, Any]]

class AuthReport(BaseModel):
    metadata: ReportMetadata
    successful_logins: int
    failed_logins: int
    activity: List[Dict[str, Any]]

class FirewallReport(BaseModel):
    metadata: ReportMetadata
    allowed: int
    blocked: int
    rejected: int
    activity: List[Dict[str, Any]]
