import uuid
from datetime import datetime, timezone

import json
def create_envelope(identity, event_type, source, payload, event_id=None, timestamp=None, metadata=None):
    """
    Creates a Phase 4A common event envelope for endpoint telemetry.
    """
    if not event_id:
        event_id = str(uuid.uuid4())
    if not timestamp:
        timestamp = datetime.now(timezone.utc).isoformat()
        
    if isinstance(payload, dict):
        payload = json.dumps(payload)
        
    return {
        "event_id": event_id,
        "agent_id": identity.agent_id,
        "hostname": identity.hostname,
        "operating_system": f"{identity.os_type} {identity.os_version}",
        "timestamp": timestamp,
        "event_type": event_type,
        "source": source,
        "payload": payload,
        "metadata": metadata or {}
    }
