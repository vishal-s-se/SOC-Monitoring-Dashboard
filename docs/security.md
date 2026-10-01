# Security Controls

This page distinguishes implemented controls from deployment configuration and missing capabilities.

## Implemented

- **Authentication:** Passwords use bcrypt through Passlib. Login returns expiring JWT bearer tokens. Logout revokes the token identifier in the current backend process.
- **Authorization:** Active-user checks and role enforcement cover the secured API router. Retention writes and MITRE seeding require administrator access; report reads require analyst access.
- **Input security:** Pydantic request models, bounded pagination, query/path validation, IP validation, request-size limits, WebSocket message limits, and sanitized export filenames are used.
- **Rate limiting:** Login, general API, expensive API, and WebSocket connection paths use in-memory limits. Limits are process-local.
- **Web security:** CORS is explicit, security headers include content-type sniffing and framing protections, and error responses avoid stack traces.
- **WebSocket security:** The backend checks a bearer token, active user, connection count, message size, and supported message types.
- **Agent/collector security:** Collector routes require `X-Agent-Auth`, compare the shared secret in constant time, validate payloads, reject oversized requests, and use a database session that preserves post-commit objects.
- **Audit logging:** Authentication failures/successes, authorization failures, WebSocket failures, retention operations, and security outcomes are recorded without passwords or token values.
- **Export security:** CSV response names are sanitized, exports are marked `no-store`, and IP report inputs are parsed as IP addresses.
- **Retention security:** Retention policy and cleanup operations are authenticated, administrator-gated where required, bounded, and audited.

## Configured or optional

- `SECRET_KEY`, `AGENT_SHARED_SECRET`, database credentials, CORS origins, rate limits, request limits, token lifetime, and WebSocket limits are environment-configurable.
- `ENVIRONMENT=production` rejects debug mode, wildcard CORS, unsafe secret values, and default database credentials.
- `HTTPS_ENABLED` documents deployment intent; TLS termination and certificate validation must be configured at the deployment boundary.
- PostgreSQL roles and network firewall rules are deployment responsibilities.

## Not implemented or remaining

- Windows/Linux endpoint agents and their certificate identity are not present in this repository.
- The dashboard API client does not inject bearer credentials and the dashboard WebSocket hook does not attach a token. Protected dashboard API/WebSocket use requires frontend authentication integration.
- CSRF middleware is not present. The current API uses bearer headers rather than browser cookies; reassess if cookie authentication is introduced.
- Revocation storage is in-process and is lost on backend restart. Use a shared session/revocation store before multi-process deployment.
- TLS certificates, rotation automation, external WAF, and centralized rate-limit storage are not supplied.

Do not interpret telemetry, a detection result, an alert, or a MITRE mapping as proof of compromise without analyst review and supporting evidence.
