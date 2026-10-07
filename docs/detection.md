# Detection and Alert Documentation

## Rule model

Detection rules are stored in `detection_rule` and exposed through `/api/v1/detections/rules`. A rule contains a unique `rule_id`, name, description, enabled flag, severity, JSON conditions, tags, and version. A matching event may create a `DetectionResult`; the result can reference an `Alert`.

The backend synchronizes an idempotent initial catalog at startup. `RULE-004` through `RULE-015` are defined in `backend/app/services/detection_catalog.py`; single-event rules are enabled, while rules requiring historical correlation or baselines remain disabled until the corresponding context exists. Existing disabled rules are never re-enabled by synchronization.

The catalog covers admin logins, account creation, firewall denies, process and service events, PowerShell, outbound bursts, closed-port repetition, login-after-failure, unusual sources, brute force, and lateral movement indicators. The last six correlation/baseline cases are represented for configuration visibility but are not claimed as active detections by the current single-event evaluator.

## Expected lifecycle

```text
Event -> DetectionRule match -> DetectionResult -> Alert -> evidence/related events -> Investigation -> explicit MITRE mapping
```

Detection results and alerts are evidence-management records. They are not automatically proof of compromise.

## Rule documentation template

Use this template for every deployed rule:

| Field | Value |
|---|---|
| Rule ID | `RULE_ID` |
| Name | `RULE_NAME` |
| Purpose | `WHY_THIS_RULE_EXISTS` |
| Input event type | `EVENT_TYPE` |
| Conditions | Exact JSON conditions from `detection_rule.conditions` |
| Severity | Rule severity from the database |
| Alert behavior | Whether the rule creates or updates an alert |
| MITRE mapping | Explicit mapping record, if present |
| Limitations | Producer coverage, false positives, and missing context |

## Candidate lab scenarios

Repeated authentication failures, successful login after failures, firewall blocks, suspicious processes/PowerShell, service creation, scanning indicators, unusual source activity, and outbound bursts can be tested only when the producer emits the required normalized fields and a corresponding rule is configured. See [SOC lab guide](soc-lab.md).

No scenario should be described as supported solely because an event field exists in the normalized model.
