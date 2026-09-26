import json
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

def parse_windows_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Windows Event Log structure."""
    normalized = {}
    
    # Common Windows Event Fields (e.g., from EventLog or Sysmon)
    # Payload might have 'EventID', 'Provider', 'EventData', 'System', etc.
    system = payload.get('System', {})
    event_data = payload.get('EventData', {})
    
    # Try to extract EventID
    event_id = system.get('EventID')
    if event_id:
        normalized['event_category'] = 'windows'
        normalized['event_type'] = str(event_id)
        
    # User / Security
    security = system.get('Security', {})
    if isinstance(security, dict) and security.get('UserID'):
        normalized['username'] = security.get('UserID')
    elif event_data.get('TargetUserName'):
        normalized['username'] = event_data.get('TargetUserName')
        
    # Network / Sysmon Event ID 3 (Network connection)
    if event_id == 3:
        normalized['source_ip'] = event_data.get('SourceIp')
        normalized['destination_ip'] = event_data.get('DestinationIp')
        normalized['source_port'] = int(event_data.get('SourcePort')) if event_data.get('SourcePort') else None
        normalized['destination_port'] = int(event_data.get('DestinationPort')) if event_data.get('DestinationPort') else None
        normalized['protocol'] = event_data.get('Protocol')
        normalized['action'] = "network_connection"
        
    # Sysmon Event ID 1 (Process Creation)
    if event_id == 1:
        normalized['action'] = "process_creation"
        # We don't have dedicated process fields in the Event model yet, 
        # so we rely on metadata_ for extra fields or existing fields.
        
    # Severity parsing (Windows Level)
    level = system.get('Level')
    if level:
        if str(level) in ['1', '2', '3']:
            normalized['severity'] = 'HIGH'
        elif str(level) == '4':
            normalized['severity'] = 'INFO'
            
    return normalized

def parse_linux_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Linux syslog/auth/journald structure."""
    normalized = {}
    
    normalized['event_category'] = 'linux'
    
    message = payload.get('message', '')
    syslog_facility = payload.get('facility', '')
    
    if 'sshd' in message or 'sshd' in payload.get('process', ''):
        normalized['event_type'] = 'ssh_login'
        normalized['protocol'] = 'ssh'
        if 'Accepted' in message:
            normalized['action'] = 'login_success'
        elif 'Failed' in message:
            normalized['action'] = 'login_failed'
            
        # Basic parsing for user and IP from sshd log
        # e.g. "Accepted publickey for root from 192.168.1.100 port 50130 ssh2"
        parts = message.split()
        if 'for' in parts and 'from' in parts:
            try:
                for_idx = parts.index('for')
                from_idx = parts.index('from')
                if from_idx > for_idx:
                    normalized['username'] = parts[for_idx + 1]
                    normalized['source_ip'] = parts[from_idx + 1]
            except ValueError:
                pass

    if 'sudo' in message or 'sudo' in payload.get('process', ''):
        normalized['event_type'] = 'sudo'
        normalized['action'] = 'privilege_escalation'

    return normalized

def parse_event_payload(source_type: str, raw_payload: str) -> Dict[str, Any]:
    """Main parser dispatch based on OS / source_type."""
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        logger.warning("Failed to decode raw payload as JSON")
        return {}
        
    if not isinstance(payload, dict):
        return {}
        
    if source_type.lower() in ['windows', 'windows_event', 'sysmon']:
        return parse_windows_event(payload)
    elif source_type.lower() in ['linux', 'syslog', 'journald', 'auth']:
        return parse_linux_event(payload)
    
    return {}
