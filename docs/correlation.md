# Correlation Engine

The Phase 12C Correlation Engine evaluates multi-stage behavioral patterns across historical time-windows.

## Mechanisms
- **Historical Queries**: Uses `DBPollingTransport` to query past events within PostgreSQL.
- **Time Windows**: Evaluates thresholds (e.g., X events in Y minutes).
- **Deduplication**: Generates `Synthetic Events` and maintains state to prevent alert flooding.

## Behavioral Rules
- **RULE-009 (Large Outbound Burst)**: Excessive network traffic in a 5-minute window.
- **RULE-010 (Repeated Closed Ports)**: Firewall drops indicating scanning.
- **RULE-011 & RULE-013 (Login Failures / Brute Force)**: Multiple failed logins for a single user/IP within 15 minutes.
- **RULE-012 (Unusual Source)**: Successful login from an IP with exactly 0 observations over the configured `baseline_days` (e.g., 7 days).
- **RULE-014 (Lateral Movement)**: Consecutive distinct host logins from a single source IP within 30 minutes.

*Note: Correlation rules rely heavily on consistent timestamping and normalized parsed fields.*
