import json
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

def parse_windows_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Windows Event Log structure."""
    normalized = {}

    system = payload.get('System', {})
    event_data = payload.get('EventData', {})
    event_id = system.get('EventID')

    if event_id:
        normalized['event_category'] = 'windows'
        normalized['event_type'] = str(event_id)

    security = system.get('Security', {})
    if isinstance(security, dict) and security.get('UserID'):
        normalized['username'] = security.get('UserID')
    elif event_data.get('TargetUserName'):
        normalized['username'] = event_data.get('TargetUserName')

    if event_id == 4624:
        normalized['event_category'] = 'authentication'
        normalized['action'] = 'login_success'
        normalized['source_ip'] = event_data.get('IpAddress')
    elif event_id == 4625:
        normalized['event_category'] = 'authentication'
        normalized['action'] = 'login_failed'
        normalized['source_ip'] = event_data.get('IpAddress')
    elif event_id in [4720]:
        normalized['event_category'] = 'account'
        normalized['event_type'] = 'user_created'
        normalized['action'] = 'created'
    elif event_id in [4697, 7045]:
        normalized['event_category'] = 'service'
        normalized['event_type'] = 'service_created'
    elif event_id in [1, 4688]:
        normalized['event_category'] = 'process'
        normalized['action'] = 'process_creation'
        normalized['event_type'] = 'process_creation'
        cmdline = str(event_data.get('CommandLine', '')).lower()
        image = str(event_data.get('Image', '')).lower()
        if 'powershell' in cmdline or 'powershell' in image:
            normalized['event_type'] = 'powershell'
    elif event_id == 3:
        normalized['event_category'] = 'network'
        normalized['source_ip'] = event_data.get('SourceIp')
        normalized['destination_ip'] = event_data.get('DestinationIp')
        normalized['source_port'] = int(event_data.get('SourcePort')) if event_data.get('SourcePort') else None
        normalized['destination_port'] = int(event_data.get('DestinationPort')) if event_data.get('DestinationPort') else None
        normalized['protocol'] = event_data.get('Protocol')
        normalized['action'] = "network_connection"
    elif event_id == 5156: # Windows Filtering Platform Deny
        normalized['event_category'] = 'firewall'
        normalized['action'] = 'deny'
        normalized['source_ip'] = event_data.get('SourceAddress')

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
        normalized['event_category'] = 'authentication'
        normalized['event_type'] = 'ssh_login'
        normalized['protocol'] = 'ssh'
        if 'Accepted' in message:
            normalized['action'] = 'login_success'
        elif 'Failed' in message:
            normalized['action'] = 'login_failed'

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
        normalized['event_category'] = 'process'
        normalized['event_type'] = 'sudo'
        normalized['action'] = 'privilege_escalation'
        
    if 'iptables' in message.lower() or 'ufw block' in message.lower():
        normalized['event_category'] = 'firewall'
        normalized['action'] = 'deny'
        # Basic IP extraction fallback
        if 'SRC=' in message:
            try:
                normalized['source_ip'] = message.split('SRC=')[1].split()[0]
            except:
                pass

    return normalized

def parse_event_payload(source_type: str, raw_payload: str) -> Dict[str, Any]:
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
