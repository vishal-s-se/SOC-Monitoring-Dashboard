# Authorized SOC Lab Guide

Use only systems and traffic that you own or are explicitly authorized to test. These scenarios describe validation intent; they do not assert that a Windows or Linux agent exists in this repository.

## Common trace

For a supported producer event, validate this sequence:

```text
Controlled activity
  -> producer payload
  -> X-Agent-Auth collector request
  -> RawLog preservation
  -> Event normalization
  -> matching DetectionRule, if configured
  -> DetectionResult and Alert, if the rule creates one
  -> Investigation and evidence
  -> MITRE mapping, if explicitly created
  -> authenticated API and dashboard view
```

An event indicator is not proof of compromise. Record the source, timestamp, host, user, IPs, ports, rule, and evidence used for every lab result.

## Collector smoke test

The repository can validate this scenario without an endpoint agent by sending a Pydantic-valid request to the collector:

1. Set `AGENT_SHARED_SECRET=YOUR_AGENT_TOKEN`.
2. Register an agent with `POST /api/v1/agent/register`.
3. Send `POST /api/v1/agent/heartbeat` with an ISO-8601 timestamp and `ONLINE` status.
4. Send `POST /api/v1/agent/events` with an event identifier, hostname, source, timestamp, and raw payload.
5. Confirm `RawLog.event_identifier` and `Event.event_id` exist in PostgreSQL.
6. Confirm the authenticated backend API can return the normalized event.

This verifies collection, raw preservation, normalization, and database persistence. It does not prove detection or alerting.

## Final demonstration workflow

Use a producer and detection rule that are configured in the authorized lab. The repository does not ship endpoint agents or a default enabled rule catalog, so the collector smoke test is the supported baseline when those are unavailable.

1. Generate controlled endpoint activity on an owned or explicitly authorized system.
2. Have the authorized producer collect the telemetry.
3. Submit the event to the collector with `X-Agent-Auth`.
4. Confirm the raw payload is preserved as `RawLog`.
5. Confirm the payload is normalized into `Event` fields.
6. Confirm a matching enabled `DetectionRule` produces a `DetectionResult`.
7. Confirm the configured rule creates an `Alert`.
8. Open the alert in the dashboard or retrieve it through the authenticated API/WebSocket.
9. Create or open an investigation for the alert.
10. Add evidence and retrieve related events using the investigation filters.
11. Open the attack timeline for the host, IP, or investigation context.
12. Review explicitly configured MITRE ATT&CK mappings and tactic context.
13. Resolve the alert and record the resolution evidence.

For a producer-free demonstration, stop after step 5 and show the raw event, normalized event, API response, and dashboard event view. Do not present later steps as completed unless a detection rule and producer have been configured.

## Scenario matrix

| Scenario | Expected telemetry | Repository status |
|---|---|---|
| Repeated authentication failures | Authentication event with username, source IP, host, and timestamp | Collector accepts arbitrary event payloads; no checked-in agent or seeded rule is present. |
| Successful login after failures | Authentication success linked by host/user/time | Same limitation; configure a rule before expecting an alert. |
| Port scanning indicator | Multiple network events with source/destination IPs, ports, and protocol | Event schema supports these fields; no endpoint network sensor is included. |
| Firewall block | Firewall event with action, IPs, ports, and protocol | Report/query surfaces exist; producer and seeded rule are absent. |
| Suspicious process | Process event with process name, user, host, and timestamp | Normalized event model supports process fields; no agent is included. |
| Suspicious PowerShell | Process or PowerShell event with command metadata | No Windows collector or built-in PowerShell rule is included. |
| Service creation | Service event with service name, account, host, and timestamp | No endpoint service monitor is included. |
| Unusual source activity | Event source differs from the host's normal history | Analytics models/API exist; baseline generation requires configured data. |
| Network activity | Network event with protocol and endpoint fields | Event model and investigation filters support the fields; producer is external. |
| Correlation | Several related events produce a correlation/deviation record | Correlation models/API exist; no default live rule catalog is seeded. |

## What to verify when a rule is configured

For each configured rule, record:

- Rule ID, name, conditions, enabled state, and severity.
- Input event fields and the raw payload.
- Detection result status and rule relationship.
- Alert status, evidence, related events, and investigation relationship.
- Explicit MITRE mapping and tactic/technique display.
- Dashboard API and WebSocket behavior.

Do not label unsupported Windows Security, Defender, Sysmon, RDP, journald, kernel, or firewall telemetry as collected. Those sources require an external agent or producer implementation.
