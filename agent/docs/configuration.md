# Configuration

Copy `agent.yml.example` to a local `agent.yml`. The example documents the collector host and port, authentication, TLS, identity file, hostname supplied by the operating system, enabled sources, collection interval, buffer size, payload limit, retry delay, and journald switch.

Authentication can be supplied as `collector.auth_token` for local development or through `SOC_AGENT_AUTH_TOKEN`, preferably in a mode `0600` service environment file. Real credentials must never be committed. `collector.tls: true` selects HTTPS and uses Requests' certificate validation defaults.

The stable agent ID is generated once in `agent.id_file`. Cursor files and the durable event buffer live under `agent.state_dir`. The buffer is bounded by `agent.buffer_max_events`; when full, the oldest event is explicitly logged as discarded.