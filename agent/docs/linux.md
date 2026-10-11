# Linux Agent

## Implemented

The file collector supports distribution-specific paths such as `auth.log`, `secure`, `syslog`, and `messages`. It tracks inode and byte offset, handles rotation and truncation, and persists state atomically. Missing files and permission errors are logged without stopping other sources.

Optional journald collection uses `journalctl --output=json --show-cursor` with a persisted cursor. It is enabled with `agent.journald_enabled: true` and requires `journalctl` on the host. Journald raw records are preserved in the common envelope.

SSH, authentication, sudo, firewall, kernel, service, and application records are collected when they are written to the configured files or journald. The agent does not claim semantic parsing or detection; those remain collector-side responsibilities.