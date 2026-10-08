# Known Limitations

- **Linux Runtime**: Validated statically via Python unit tests (22/22), but officially `NOT VERIFIED` at runtime as the deployment environment is strictly Windows-based.
- **Windows Security Log**: Microsoft explicitly restricts `Security` channel reads. The Agent must be run with elevated Administrator privileges, otherwise it falls back to capturing only `System` and `Application` logs.
- **Performance**: Validated for lab throughput (~100 EPS). Not stress-tested for enterprise multi-node ingestion.
