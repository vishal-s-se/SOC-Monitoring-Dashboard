import json
import ssl
from dataclasses import dataclass
from urllib import error, request

from .config import AgentConfig


class TransportError(Exception):
    pass


@dataclass
class CollectorTransport:
    config: AgentConfig

    def post(self, path: str, payload: dict) -> dict:
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Agent-Auth": self.config.agent_auth,
        }
        url = f"{self.config.base_url}/{path.lstrip('/')}"
        context = None
        if self.config.collector_scheme == "https":
            context = ssl.create_default_context()
            if not self.config.tls_verify:
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
        try:
            with request.urlopen(
                request.Request(url, data=body, headers=headers, method="POST"),
                timeout=self.config.request_timeout,
                context=context,
            ) as response:
                response_body = response.read().decode("utf-8")
                parsed = json.loads(response_body) if response_body else {}
                if not isinstance(parsed, dict):
                    raise TransportError("collector returned a non-object response")
                return parsed
        except (error.HTTPError, error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise TransportError(str(exc)) from exc
