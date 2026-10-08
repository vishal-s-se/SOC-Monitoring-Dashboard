# MITRE ATT&CK Mappings

SOC Monitor maps specific detections to the MITRE ATT&CK framework to provide tactical context.

## Implemented Mappings
- **T1078 (Valid Accounts)**: Mapped to unusual authentication successes (RULE-012).
- **T1110 (Brute Force)**: Mapped to repeated authentication failures (RULE-013).
- **T1046 (Network Service Discovery)**: Mapped to repeated closed port firewall drops (RULE-010).
- **T1021 (Remote Services)**: Mapped to lateral movement detections (RULE-014).

*Note: Mapping indicates technical overlap. Detection of T1110 (Brute Force) means the behavior was observed, not necessarily that the adversary successfully bypassed authentication.*
