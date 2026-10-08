# Security Controls

## Authentication & Authorization
- **Dashboard**: Protected via JWT (JSON Web Tokens).
- **WebSocket**: Requires JWT transmission in the connection URL parameters.
- **Agents**: Requires `AGENT_SHARED_SECRET` in the `X-Agent-Auth` header to connect to the Collector.

## Data Protection
- **Injection Prevention**: 100% reliance on SQLAlchemy 2.0 ORM parameterization. No raw string SQL execution.
- **Configuration Secrecy**: `pydantic_settings` explicitly bans deployment of "changeme" or default Postgres passwords when `ENVIRONMENT="production"`.

## Architecture Limits
- **Network Segmentation**: Agents strictly cannot route to the Database or Dashboard ports.
