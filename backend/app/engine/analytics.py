import math
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from backend.app.models.event import Event
from backend.app.models.analytics import BehaviorBaseline, BehaviorDeviation, BehaviorDeviationEvidence
from backend.app.engine.event_bus import event_bus

class BehavioralAnalyticsEngine:
    async def calculate_host_event_volume_baseline(self, db: AsyncSession, days_back: int = 7):
        """Calculate the mean and stddev of daily event volume per host."""
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(days=days_back)
        
        # 1. Group events by host and date
        stmt = select(
            Event.hostname,
            func.date_trunc('day', Event.timestamp).label('day'),
            func.count(Event.id).label('daily_count')
        ).where(
            Event.timestamp >= start_time,
            Event.hostname.is_not(None)
        ).group_by(
            Event.hostname,
            func.date_trunc('day', Event.timestamp)
        )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        host_daily_counts: Dict[str, List[int]] = {}
        for row in rows:
            host = row.hostname
            if host not in host_daily_counts:
                host_daily_counts[host] = []
            host_daily_counts[host].append(row.daily_count)
            
        # 2. Compute baselines
        baselines = []
        for host, counts in host_daily_counts.items():
            if len(counts) < 3: # Need at least 3 days to form a meaningful baseline
                continue
                
            mean = sum(counts) / len(counts)
            variance = sum((c - mean) ** 2 for c in counts) / len(counts)
            stddev = math.sqrt(variance)
            
            # Check existing baseline
            existing = await db.execute(
                select(BehaviorBaseline).where(
                    BehaviorBaseline.entity_type == "HOST",
                    BehaviorBaseline.entity_id == host,
                    BehaviorBaseline.metric_name == "daily_event_volume"
                )
            )
            baseline = existing.scalars().first()
            if not baseline:
                baseline = BehaviorBaseline(
                    entity_type="HOST",
                    entity_id=host,
                    metric_name="daily_event_volume",
                    time_window="1d"
                )
                db.add(baseline)
                
            baseline.expected_value = mean
            baseline.variance = stddev
            baseline.sample_count = len(counts)
            baseline.last_calculated_at = now
            baselines.append(baseline)
            
        await db.commit()
        return baselines

    async def detect_host_volume_deviations(self, db: AsyncSession, host: str, current_daily_count: int, events_to_reference: List[str] = []):
        """Detect deviations in a single day against the established baseline."""
        now = datetime.now(timezone.utc)
        stmt = select(BehaviorBaseline).where(
            BehaviorBaseline.entity_type == "HOST",
            BehaviorBaseline.entity_id == host,
            BehaviorBaseline.metric_name == "daily_event_volume"
        )
        result = await db.execute(stmt)
        baseline = result.scalars().first()
        
        if not baseline or baseline.variance == 0:
            return None
            
        # Calculate z-score
        z_score = (current_daily_count - baseline.expected_value) / baseline.variance
        
        # Deviation threshold (e.g., > 3 stddevs)
        if z_score > 3.0:
            deviation = BehaviorDeviation(
                baseline_id=baseline.id,
                entity_type="HOST",
                entity_id=host,
                metric_name="daily_event_volume",
                observed_value=float(current_daily_count),
                expected_value=baseline.expected_value,
                deviation_magnitude=z_score,
                observation_timestamp=now,
                explanation=f"Observed {current_daily_count} events today, which is unusually high compared to the historical normal of {baseline.expected_value:.1f} (stddev {baseline.variance:.1f})."
            )
            db.add(deviation)
            await db.flush()
            
            for ev_id in events_to_reference:
                ev_evidence = BehaviorDeviationEvidence(
                    deviation_id=deviation.id,
                    evidence_type="EVENT",
                    reference_id=str(ev_id)
                )
                db.add(ev_evidence)
                
            await db.commit()
            
            # Emit websocket event
            event_bus.publish("behavior_deviation_created", {
                "id": deviation.id,
                "entity_type": "HOST",
                "entity_id": host,
                "metric_name": "daily_event_volume",
                "magnitude": z_score
            })
            return deviation
            
        return None
        
    async def calculate_user_login_hours_baseline(self, db: AsyncSession, days_back: int = 30):
        """Calculate the normal authentication hours for a user."""
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(days=days_back)
        
        # Get authentication events
        stmt = select(Event).where(
            Event.timestamp >= start_time,
            Event.event_type == "login",
            Event.username.is_not(None)
        )
        result = await db.execute(stmt)
        events = result.scalars().all()
        
        user_hours: Dict[str, set] = {}
        user_counts: Dict[str, int] = {}
        for ev in events:
            user = ev.username
            hour = ev.timestamp.hour
            if user not in user_hours:
                user_hours[user] = set()
                user_counts[user] = 0
            user_hours[user].add(hour)
            user_counts[user] += 1
            
        baselines = []
        for user, hours in user_hours.items():
            if user_counts[user] < 10: # Need sufficient login samples
                continue
                
            # Compute a crude expected value as average hour (note: hours wrap around, this is simplified)
            mean_hour = sum(hours) / len(hours)
            variance = sum((h - mean_hour)**2 for h in hours) / len(hours)
            stddev = math.sqrt(variance)
            
            existing = await db.execute(
                select(BehaviorBaseline).where(
                    BehaviorBaseline.entity_type == "USER",
                    BehaviorBaseline.entity_id == user,
                    BehaviorBaseline.metric_name == "login_hour"
                )
            )
            baseline = existing.scalars().first()
            if not baseline:
                baseline = BehaviorBaseline(
                    entity_type="USER",
                    entity_id=user,
                    metric_name="login_hour",
                    time_window="1h"
                )
                db.add(baseline)
                
            baseline.expected_value = mean_hour
            baseline.variance = stddev
            baseline.sample_count = user_counts[user]
            baseline.last_calculated_at = now
            baselines.append(baseline)
            
        await db.commit()
        return baselines

    async def check_user_login_deviation(self, db: AsyncSession, event: Event):
        if event.event_type != "login" or not event.username:
            return None
            
        stmt = select(BehaviorBaseline).where(
            BehaviorBaseline.entity_type == "USER",
            BehaviorBaseline.entity_id == event.username,
            BehaviorBaseline.metric_name == "login_hour"
        )
        result = await db.execute(stmt)
        baseline = result.scalars().first()
        
        if not baseline or baseline.variance == 0:
            return None
            
        current_hour = event.timestamp.hour
        # Distance accounting for 24h wrap
        dist = min(abs(current_hour - baseline.expected_value), 24 - abs(current_hour - baseline.expected_value))
        z_score = dist / baseline.variance
        
        if z_score > 3.0: # Deviation > 3 stddevs
            deviation = BehaviorDeviation(
                baseline_id=baseline.id,
                entity_type="USER",
                entity_id=event.username,
                metric_name="login_hour",
                observed_value=float(current_hour),
                expected_value=baseline.expected_value,
                deviation_magnitude=z_score,
                observation_timestamp=event.timestamp,
                explanation=f"User logged in at hour {current_hour}:00, which is outside historically normal hours (mean {baseline.expected_value:.1f}:00, stddev {baseline.variance:.1f}h)."
            )
            db.add(deviation)
            await db.flush()
            
            ev_evidence = BehaviorDeviationEvidence(
                deviation_id=deviation.id,
                evidence_type="EVENT",
                reference_id=str(event.id)
            )
            db.add(ev_evidence)
            await db.commit()
            
            event_bus.publish("behavior_deviation_created", {
                "id": deviation.id,
                "entity_type": "USER",
                "entity_id": event.username,
                "metric_name": "login_hour",
                "magnitude": z_score
            })
            return deviation
            
        return None


    async def correlate_deviation(self, db: AsyncSession, deviation: BehaviorDeviation):
        """
        Deterministically correlate a behavioral deviation with other entities (alerts, users, investigations).
        """
        from backend.app.models.analytics import BehaviorCorrelation
        from backend.app.models.alert import Alert
        from backend.app.models.investigation import InvestigationEvidence
        from sqlalchemy.orm import selectinload
        
        # Load evidence
        stmt = select(BehaviorDeviation).options(selectinload(BehaviorDeviation.evidence)).where(BehaviorDeviation.id == deviation.id)
        result = await db.execute(stmt)
        dev = result.scalars().first()
        if not dev:
            return
            
        now = datetime.now(timezone.utc)
        created_correlations = []
        
        # 1. Temporal Alert Correlation (±15 minutes)
        # For simplicity, we just look back 15 mins and forward 15 mins from deviation.observation_timestamp
        window_start = dev.observation_timestamp - timedelta(minutes=15)
        window_end = dev.observation_timestamp + timedelta(minutes=15)
        
        alert_stmt = select(Alert).where(Alert.timestamp >= window_start, Alert.timestamp <= window_end)
        # entity filter
        if dev.entity_type == "HOST":
            alert_stmt = alert_stmt.where(Alert.hostname == dev.entity_id)
        elif dev.entity_type == "USER":
            alert_stmt = alert_stmt.where(Alert.username == dev.entity_id)
        elif dev.entity_type == "IP":
            alert_stmt = alert_stmt.where((Alert.source_ip == dev.entity_id) | (Alert.destination_ip == dev.entity_id))
            
        alerts_result = await db.execute(alert_stmt)
        alerts = alerts_result.scalars().all()
        
        for al in alerts:
            # check if correlation already exists
            existing = await db.execute(select(BehaviorCorrelation).where(
                BehaviorCorrelation.deviation_id == dev.id,
                BehaviorCorrelation.related_entity_type == "ALERT",
                BehaviorCorrelation.related_entity_id == str(al.id)
            ))
            if not existing.scalars().first():
                bc = BehaviorCorrelation(
                    deviation_id=dev.id,
                    related_entity_type="ALERT",
                    related_entity_id=str(al.id),
                    relationship_type="TEMPORAL",
                    relationship_reason="Alert occurred within 15 minutes on the same entity",
                    time_difference_seconds=int((al.timestamp - dev.observation_timestamp).total_seconds())
                )
                db.add(bc)
                created_correlations.append(bc)
                
        # 2. Shared Evidence / Investigation Correlation
        event_ids = [e.reference_id for e in dev.evidence if e.evidence_type == "EVENT"]
        if event_ids:
            # Find investigations containing these events
            inv_stmt = select(InvestigationEvidence).where(
                InvestigationEvidence.evidence_type == "EVENT",
                InvestigationEvidence.evidence_id.in_(event_ids)
            )
            inv_result = await db.execute(inv_stmt)
            inv_evidences = inv_result.scalars().all()
            
            seen_invs = set()
            for ie in inv_evidences:
                if ie.investigation_id in seen_invs:
                    continue
                seen_invs.add(ie.investigation_id)
                
                existing = await db.execute(select(BehaviorCorrelation).where(
                    BehaviorCorrelation.deviation_id == dev.id,
                    BehaviorCorrelation.related_entity_type == "INVESTIGATION",
                    BehaviorCorrelation.related_entity_id == str(ie.investigation_id)
                ))
                if not existing.scalars().first():
                    bc = BehaviorCorrelation(
                        deviation_id=dev.id,
                        related_entity_type="INVESTIGATION",
                        related_entity_id=str(ie.investigation_id),
                        relationship_type="SHARED_ENTITY",
                        relationship_reason="Deviation evidence is part of this investigation"
                    )
                    db.add(bc)
                    created_correlations.append(bc)
                    
            # 3. Entity Expansion from Events
            ev_stmt = select(Event).where(Event.id.in_([int(eid) for eid in event_ids]))
            ev_result = await db.execute(ev_stmt)
            events = ev_result.scalars().all()
            
            seen_hosts = set()
            seen_users = set()
            seen_ips = set()
            
            for e in events:
                if e.hostname and e.hostname != dev.entity_id:
                    seen_hosts.add(e.hostname)
                if e.username and e.username != dev.entity_id:
                    seen_users.add(e.username)
                if e.source_ip and e.source_ip != dev.entity_id:
                    seen_ips.add(e.source_ip)
            
            for host in seen_hosts:
                existing = await db.execute(select(BehaviorCorrelation).where(
                    BehaviorCorrelation.deviation_id == dev.id,
                    BehaviorCorrelation.related_entity_type == "HOST",
                    BehaviorCorrelation.related_entity_id == host
                ))
                if not existing.scalars().first():
                    bc = BehaviorCorrelation(
                        deviation_id=dev.id,
                        related_entity_type="HOST",
                        related_entity_id=host,
                        relationship_type="EXPLICIT",
                        relationship_reason="Host explicitly referenced in deviation events"
                    )
                    db.add(bc)
                    created_correlations.append(bc)
                    
            for user in seen_users:
                existing = await db.execute(select(BehaviorCorrelation).where(
                    BehaviorCorrelation.deviation_id == dev.id,
                    BehaviorCorrelation.related_entity_type == "USER",
                    BehaviorCorrelation.related_entity_id == user
                ))
                if not existing.scalars().first():
                    bc = BehaviorCorrelation(
                        deviation_id=dev.id,
                        related_entity_type="USER",
                        related_entity_id=user,
                        relationship_type="EXPLICIT",
                        relationship_reason="User explicitly referenced in deviation events"
                    )
                    db.add(bc)
                    created_correlations.append(bc)
                    
        if created_correlations:
            await db.commit()
            for bc in created_correlations:
                event_bus.publish("behavior_correlation_created", {
                    "id": bc.id,
                    "deviation_id": bc.deviation_id,
                    "related_entity_type": bc.related_entity_type,
                    "related_entity_id": bc.related_entity_id
                })
        
        return created_correlations

analytics_engine = BehavioralAnalyticsEngine()

