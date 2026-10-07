import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct
from backend.app.models.event import Event
import uuid

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

class CorrelationEngine:
    def __init__(self):
        # Configurable thresholds
        self.burst_window_minutes = settings.CORRELATION_BURST_WINDOW_MINUTES
        self.burst_threshold = settings.CORRELATION_BURST_THRESHOLD
        
        self.closed_port_window_minutes = settings.CORRELATION_CLOSED_PORT_WINDOW_MINUTES
        self.closed_port_threshold = settings.CORRELATION_CLOSED_PORT_THRESHOLD
        
        self.login_failure_window_minutes = settings.CORRELATION_LOGIN_FAILURE_WINDOW_MINUTES
        self.login_failure_threshold = settings.CORRELATION_LOGIN_FAILURE_THRESHOLD
        
        self.baseline_days = settings.CORRELATION_BASELINE_DAYS
        self.baseline_min_observations = settings.CORRELATION_BASELINE_MIN_OBSERVATIONS
        
        self.lateral_movement_window_minutes = settings.CORRELATION_LATERAL_MOVEMENT_WINDOW_MINUTES

    async def correlate(self, db: AsyncSession, ev: Event) -> List[Event]:
        synthetic_events = []
        
        # RULE-009: Large outbound burst
        if ev.event_category == "network" and ev.action == "network_connection" and ev.source_ip:
            stmt = select(func.count(Event.id)).where(
                Event.source_ip == ev.source_ip,
                Event.event_category == "network",
                Event.action == "network_connection",
                Event.timestamp >= ev.timestamp - timedelta(minutes=self.burst_window_minutes)
            )
            result = await db.execute(stmt)
            count = result.scalar() or 0
            if count >= self.burst_threshold:
                syn = self._create_synthetic(ev, "outbound_burst", f"Observed {count} network connections from {ev.source_ip}")
                synthetic_events.append(syn)
                
        # RULE-010: Repeated closed ports
        if ev.event_category == "firewall" and ev.action == "deny" and ev.source_ip:
            stmt = select(func.count(distinct(Event.destination_port))).where(
                Event.source_ip == ev.source_ip,
                Event.event_category == "firewall",
                Event.action == "deny",
                Event.timestamp >= ev.timestamp - timedelta(minutes=self.closed_port_window_minutes)
            )
            result = await db.execute(stmt)
            distinct_ports = result.scalar() or 0
            if distinct_ports >= self.closed_port_threshold:
                syn = self._create_synthetic(ev, "closed_port", f"Observed drops to {distinct_ports} distinct ports from {ev.source_ip}")
                synthetic_events.append(syn)
                
        # RULE-011 and RULE-013: Login failures and success after failure
        if ev.event_category == "authentication":
            if ev.action == "login_success":
                # Check RULE-011: Success after failures
                stmt = select(func.count(Event.id)).where(
                    Event.username == ev.username,
                    Event.source_ip == ev.source_ip,
                    Event.event_category == "authentication",
                    Event.action == "login_failed",
                    Event.timestamp >= ev.timestamp - timedelta(minutes=self.login_failure_window_minutes)
                )
                result = await db.execute(stmt)
                failures = result.scalar() or 0
                if failures >= self.login_failure_threshold:
                    syn = self._create_synthetic(ev, "login_success_after_failures", f"Login success after {failures} failures for {ev.username}")
                    synthetic_events.append(syn)
                    
                # Check RULE-012: Unusual source for host
                # We do a simple baseline: how many days has this source IP been seen for this host in the last N days?
                if ev.hostname and ev.source_ip:
                    stmt = select(func.count(distinct(func.date_trunc('day', Event.timestamp)))).where(
                        Event.hostname == ev.hostname,
                        Event.source_ip == ev.source_ip,
                        Event.event_category == "authentication",
                        Event.action == "login_success",
                        Event.timestamp < ev.timestamp,
                        Event.timestamp >= ev.timestamp - timedelta(days=self.baseline_days)
                    )
                    result = await db.execute(stmt)
                    days_seen = result.scalar() or 0
                    
                    # Also check total baseline days for this host to ensure we have enough data
                    stmt2 = select(func.count(distinct(func.date_trunc('day', Event.timestamp)))).where(
                        Event.hostname == ev.hostname,
                        Event.event_category == "authentication",
                        Event.action == "login_success",
                        Event.timestamp < ev.timestamp,
                        Event.timestamp >= ev.timestamp - timedelta(days=self.baseline_days)
                    )
                    result2 = await db.execute(stmt2)
                    host_total_days = result2.scalar() or 0
                    
                    if host_total_days >= self.baseline_min_observations and days_seen == 0:
                        syn = self._create_synthetic(ev, "unusual_source", f"Unusual successful login source {ev.source_ip} for host {ev.hostname}")
                        synthetic_events.append(syn)

            elif ev.action == "login_failed":
                # Check RULE-013: Brute force pattern
                if ev.source_ip:
                    stmt = select(func.count(Event.id)).where(
                        Event.source_ip == ev.source_ip,
                        Event.event_category == "authentication",
                        Event.action == "login_failed",
                        Event.timestamp >= ev.timestamp - timedelta(minutes=self.login_failure_window_minutes)
                    )
                    result = await db.execute(stmt)
                    failures = result.scalar() or 0
                    if failures >= self.login_failure_threshold:
                        syn = self._create_synthetic(ev, "brute_force_pattern", f"Brute force pattern detected from {ev.source_ip} ({failures} failures)")
                        synthetic_events.append(syn)

        # RULE-014: Lateral movement indicators
        # Simple heuristic: Success login from a source_ip that is internal, followed by process execution/service creation within 30 mins
        # This is triggered when a process or service is created.
        if ev.event_category in ["process", "service", "powershell"]:
            if ev.hostname:
                stmt = select(Event.source_ip).where(
                    Event.hostname == ev.hostname,
                    Event.event_category == "authentication",
                    Event.action == "login_success",
                    Event.timestamp >= ev.timestamp - timedelta(minutes=self.lateral_movement_window_minutes),
                    Event.timestamp < ev.timestamp
                ).order_by(Event.timestamp.desc()).limit(1)
                result = await db.execute(stmt)
                source_ip = result.scalar_one_or_none()
                if source_ip and source_ip != "127.0.0.1" and source_ip != "::1":
                    syn = self._create_synthetic(ev, "lateral_movement", f"Lateral movement indicator: execution on {ev.hostname} shortly after login from {source_ip}")
                    synthetic_events.append(syn)
                    
        return synthetic_events

    def _create_synthetic(self, base_ev: Event, event_type: str, message: str) -> Event:
        # Create a transient Event that will match detection catalog
        return Event(
            id=base_ev.id,
            event_id=str(uuid.uuid4()),
            timestamp=base_ev.timestamp,
            agent_id=base_ev.agent_id,
            host_id=base_ev.host_id,
            hostname=base_ev.hostname,
            source_type=base_ev.source_type,
            event_category="correlation",
            event_type=event_type,
            username=base_ev.username,
            source_ip=base_ev.source_ip,
            destination_ip=base_ev.destination_ip,
            severity="HIGH",
            metadata_={"correlation_message": message, "trigger_event_id": base_ev.event_id}
        )

correlation_engine = CorrelationEngine()
