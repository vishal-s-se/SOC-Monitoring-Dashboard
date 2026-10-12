import json
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

def parse_windows_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Windows Event Log structure."""
    normalized = {}

    system = payload.get('System', {})
    event_data = payload.get('EventData', {})

    # Support both nested System dict and flat top-level dict
    raw_event_id = system.get('EventID')
    if raw_event_id is None:
        raw_event_id = payload.get('EventID')

    event_id = None
    try:
        if raw_event_id is not None:
            event_id = int(raw_event_id)
    except (ValueError, TypeError):
        pass

    if event_id is not None:
        normalized['event_category'] = 'windows'
        normalized['event_type'] = str(event_id)

    security = system.get('Security', {})
    if isinstance(security, dict) and security.get('UserID'):
        normalized['username'] = security.get('UserID')
    elif event_data.get('TargetUserName'):
        normalized['username'] = event_data.get('TargetUserName')

    # Extract channel from System
    channel = system.get('Channel') or payload.get('Channel')
    provider_name = ""
    provider = system.get('Provider', {})
    if isinstance(provider, dict):
        provider_name = provider.get('Name') or ""
    elif isinstance(provider, str):
        provider_name = provider

    # Extract message / description from EventData or payload
    message = (
        event_data.get('Message') or 
        event_data.get('Description') or 
        payload.get('Message') or 
        payload.get('RawXML') or 
        ""
    )
    if isinstance(message, str) and message:
        normalized['message'] = message

    # Category classification based on Channel, Provider, and EventID
    channel_lower = str(channel or '').lower()
    provider_lower = str(provider_name or '').lower()

    if 'application' in channel_lower:
        normalized['event_category'] = 'application'
    elif 'system' in channel_lower:
        normalized['event_category'] = 'system'
    elif 'security' in channel_lower:
        normalized['event_category'] = 'audit'
    elif 'powershell' in channel_lower or 'powershell' in provider_lower:
        normalized['event_category'] = 'powershell'
    elif 'defender' in channel_lower or 'defender' in provider_lower:
        normalized['event_category'] = 'endpoint_security'
    elif 'sysmon' in channel_lower or 'sysmon' in provider_lower:
        normalized['event_category'] = 'windows_sysmon'
    elif 'firewall' in channel_lower or 'filtering' in channel_lower:
        normalized['event_category'] = 'firewall'

    if event_id in [4624, 4625, 4648, 4776]:
        normalized['event_category'] = 'authentication'
        if event_id == 4624:
            normalized['action'] = 'login_success'
            normalized['source_ip'] = event_data.get('IpAddress')
        elif event_id == 4625:
            normalized['action'] = 'login_failed'
            normalized['source_ip'] = event_data.get('IpAddress')
    elif event_id in [4720, 4722, 4723, 4724, 4725, 4726, 4738]:
        normalized['event_category'] = 'authentication'
        normalized['event_type'] = 'account_management'
        normalized['action'] = 'created' if event_id == 4720 else 'modified'
    elif event_id in [4697, 7045]:
        normalized['event_category'] = 'services'
        normalized['event_type'] = 'service_created'
    elif event_id in [1, 4688]:
        normalized['event_category'] = 'process'
        normalized['action'] = 'process_creation'
        normalized['event_type'] = 'process_creation'
        cmdline = str(event_data.get('CommandLine', '')).lower()
        image = str(event_data.get('Image', '')).lower()
        if 'powershell' in cmdline or 'powershell' in image:
            normalized['event_category'] = 'powershell'
            normalized['event_type'] = 'powershell'
    elif event_id in [4103, 4104]:
        normalized['event_category'] = 'powershell'
        normalized['event_type'] = 'script_block_execution'
    elif event_id == 3:
        normalized['event_category'] = 'network'
        normalized['source_ip'] = event_data.get('SourceIp')
        normalized['destination_ip'] = event_data.get('DestinationIp')
        normalized['source_port'] = int(event_data.get('SourcePort')) if event_data.get('SourcePort') else None
        normalized['destination_port'] = int(event_data.get('DestinationPort')) if event_data.get('DestinationPort') else None
        normalized['protocol'] = event_data.get('Protocol')
        normalized['action'] = "network_connection"
    elif event_id in [5156, 5157]: # Windows Filtering Platform Allow / Deny
        normalized['event_category'] = 'firewall'
        normalized['action'] = 'deny' if event_id == 5157 else 'allow'
        normalized['source_ip'] = event_data.get('SourceAddress')
    elif event_id in [1116, 1117]: # Windows Defender Detection
        normalized['event_category'] = 'endpoint_security'
        normalized['action'] = 'threat_detected'

    level = system.get('Level')
    if level is None:
        level = payload.get('Level')

    if level:
        if str(level) in ['1', '2', '3']:
            normalized['severity'] = 'HIGH'
        elif str(level) == '4':
            normalized['severity'] = 'INFO'

    # Extract Native Windows Event Identifiers
    native_identifiers = {}
    
    if raw_event_id is not None:
        native_identifiers['EventID'] = raw_event_id
        
    if system.get('EventRecordID') is not None:
        native_identifiers['EventRecordID'] = system.get('EventRecordID')
        
    if provider_name:
        native_identifiers['Provider'] = provider_name
        
    if channel:
        native_identifiers['Channel'] = channel
        
    if system.get('Computer'):
        native_identifiers['Computer'] = system.get('Computer')
        
    time_created = system.get('TimeCreated', {})
    if isinstance(time_created, dict) and time_created.get('SystemTime'):
        native_identifiers['TimeCreated'] = time_created.get('SystemTime')
        
    if level is not None:
        native_identifiers['Level'] = level

    if native_identifiers:
        normalized['native_identifiers'] = native_identifiers

    return normalized

def parse_linux_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Linux syslog/auth/journald structure."""
    normalized = {}

    inner = payload.get('raw_event') if isinstance(payload.get('raw_event'), dict) else payload

    message = inner.get('MESSAGE') or inner.get('message') or inner.get('raw_line', '')
    if not isinstance(message, str):
        message = str(message or '')

    if message:
        normalized['message'] = message

    process = inner.get('SYSLOG_IDENTIFIER') or inner.get('_COMM') or inner.get('process', '')
    if not isinstance(process, str):
        process = str(process or '')

    systemd_unit = str(inner.get('_SYSTEMD_UNIT') or '')

    if not inner or (not message and not process and not systemd_unit):
        normalized['event_category'] = 'linux'
        return normalized

    normalized['event_category'] = 'system'

    priority = inner.get('PRIORITY')
    if priority is not None:
        try:
            p_val = int(priority)
            if p_val <= 3:
                normalized['severity'] = 'HIGH'
            elif p_val == 4:
                normalized['severity'] = 'MEDIUM'
            else:
                normalized['severity'] = 'INFO'
        except (ValueError, TypeError):
            pass

    # Source and category derivation
    proc_lower = process.lower()
    msg_lower = message.lower()
    unit_lower = systemd_unit.lower()

    if 'sshd' in proc_lower or 'sshd' in msg_lower:
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
                    user_parts = parts[for_idx + 1:from_idx]
                    if len(user_parts) >= 3 and user_parts[0] == 'invalid' and user_parts[1] == 'user':
                        normalized['username'] = user_parts[2]
                    elif len(user_parts) > 0:
                        normalized['username'] = user_parts[0]

                    ip_candidate = parts[from_idx + 1]
                    import ipaddress
                    try:
                        ipaddress.ip_address(ip_candidate)
                        normalized['source_ip'] = ip_candidate
                    except ValueError:
                        pass
            except (ValueError, IndexError):
                pass
    elif 'sudo' in proc_lower or 'sudo' in msg_lower:
        normalized['event_category'] = 'process'
        normalized['event_type'] = 'sudo'
        normalized['action'] = 'privilege_escalation'
        if 'USER=' in message:
            try:
                target_user = message.split('USER=')[1].split(';')[0].strip()
                if target_user:
                    normalized['username'] = target_user
            except Exception:
                pass
    elif 'su' in proc_lower or 'pam' in proc_lower:
        normalized['event_category'] = 'authentication'
        normalized['event_type'] = 'auth_session'
    elif 'kernel' in proc_lower or '_transport' in inner and inner['_transport'] == 'kernel':
        normalized['event_category'] = 'kernel'
    elif 'audit' in proc_lower or 'audit' in unit_lower or 'type=' in msg_lower:
        normalized['event_category'] = 'audit'
    elif 'iptables' in msg_lower or 'ufw block' in msg_lower or 'nftables' in msg_lower or 'firewalld' in proc_lower:
        normalized['event_category'] = 'firewall'
        normalized['action'] = 'deny'
        if 'SRC=' in message:
            try:
                normalized['source_ip'] = message.split('SRC=')[1].split()[0]
            except:
                pass
    elif 'named' in proc_lower or 'systemd-resolved' in proc_lower or 'dns' in proc_lower:
        normalized['event_category'] = 'network'
    elif 'apt' in proc_lower or 'dpkg' in proc_lower or 'yum' in proc_lower or 'dnf' in proc_lower:
        normalized['event_category'] = 'package_management'
    elif 'cron' in proc_lower or 'systemd' in proc_lower:
        normalized['event_category'] = 'services'
    elif 'app' in unit_lower or 'nginx' in proc_lower or 'apache' in proc_lower:
        normalized['event_category'] = 'application'

    # Extract Native Linux Identifiers from both inner and payload
    native_identifiers = {}
    for key in ['__CURSOR', '__REALTIME_TIMESTAMP', '__MONOTONIC_TIMESTAMP', '_BOOT_ID', '_HOSTNAME', '_SYSTEMD_UNIT', 'SYSLOG_IDENTIFIER', 'PRIORITY', '_PID', '_UID']:
        if key in inner:
            native_identifiers[key] = inner[key]
        elif key in payload:
            native_identifiers[key] = payload[key]

    if native_identifiers:
        normalized['native_identifiers'] = native_identifiers

    return normalized

def parse_event_payload(source_type: str, raw_payload: str) -> Dict[str, Any]:
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        logger.warning("Failed to decode raw payload as JSON")
        return {}

    if not isinstance(payload, dict):
        return {}

    source_type_lower = source_type.lower()
    if source_type_lower.startswith('windows') or source_type_lower == 'sysmon':
        return parse_windows_event(payload)
    elif source_type_lower.startswith('linux') or source_type_lower in ['syslog', 'journald', 'auth']:
        return parse_linux_event(payload)

    return {}
