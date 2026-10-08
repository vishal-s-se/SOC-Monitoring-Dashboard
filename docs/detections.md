# Detection Reference

The Detection Engine evaluates normalized events against static trigger conditions.

## Implemented Rules
- **RULE-004 (Unexpected Admin Login)**: Detects authentication success for 'admin'.
- **RULE-005 (Failed Login)**: Detects authentication failures.
- **RULE-006 (Privilege Escalation)**: Detects specific Windows Event IDs indicating privilege use.
- **RULE-007 (Network Scanning)**: Detects port sweep indicators.
- **RULE-008 (Malware Execution)**: Detects known bad process names or AV alerts.

*Note: Detections indicate observed behavior matching a condition. They do NOT definitively prove a system is compromised.*
