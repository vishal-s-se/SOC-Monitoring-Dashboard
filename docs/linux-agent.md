# Linux Agent Guide

The Linux Agent implements log tracking for `/var/log/auth.log` and `journalctl`.

## Status: NOT VERIFIED
**IMPORTANT**: While the Linux Agent codebase is fully implemented and passes all static Python unit tests (100% coverage locally), its actual runtime behavior has **NOT BEEN VERIFIED** due to the final validation environment being exclusively Windows-based.

## Capabilities (Implemented in Code)
- **Tail Follow**: Inotify/file-pointer tracking for flat logs.
- **Journalctl**: Uses `--after-cursor` state tracking for robust daemon log collection.
- **Payload Uniformity**: Wraps outputs in the identical JSON envelope expected by the Collector.

## Future Validation
To validate: Deploy `soc-agent` to a legitimate Ubuntu/Debian host, point `agent.yml` to the Windows Collector IP, and verify ingestion of SSH auth failures.
