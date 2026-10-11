import uvicorn
import os
import sys

# Add project_root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))
sys.path.insert(0, project_root)

from collector.app.config import settings

if __name__ == "__main__":
    kwargs = {
        "host": "0.0.0.0",
        "port": settings.COLLECTOR_PORT,
        "reload": True
    }
    
    if settings.TLS_ENABLED:
        if not settings.TLS_CERT_PATH or not settings.TLS_KEY_PATH:
            raise ValueError("Collector TLS is enabled but TLS_CERT_PATH or TLS_KEY_PATH is missing in configuration.")
        if not os.path.isfile(settings.TLS_CERT_PATH):
            raise FileNotFoundError(f"Collector TLS certificate not found at: {settings.TLS_CERT_PATH}")
        if not os.path.isfile(settings.TLS_KEY_PATH):
            raise FileNotFoundError(f"Collector TLS private key not found at: {settings.TLS_KEY_PATH}")
            
        kwargs["ssl_certfile"] = settings.TLS_CERT_PATH
        kwargs["ssl_keyfile"] = settings.TLS_KEY_PATH
        kwargs["reload"] = False # Uvicorn reload with SSL can sometimes behave unexpectedly

    uvicorn.run("collector.app.main:app", **kwargs)
