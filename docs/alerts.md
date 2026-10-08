# Alert Lifecycle & Investigations

## Alert States
`NEW` → `ACKNOWLEDGED` → `INVESTIGATING` → `RESOLVED`

## Deduplication
Repeated triggers of the same rule on the same host within an active timeframe increment the `Occurrence Count` rather than spamming the dashboard with duplicates.

## Analyst Workflows
### IP Investigation
- **Path**: IP → Associated Events → Source Hosts → Triggered Alerts → Timeline.
- **Use Case**: Determine if a single IP is spraying the network.

### Host Investigation
- **Path**: Host → System Events → Authentication Logs → Associated Alerts.
- **Use Case**: Determine if an endpoint has been fully compromised after a malware alert.

Analysts can pin related Events and Alerts to an `Investigation` object, generating a consolidated incident timeline.
