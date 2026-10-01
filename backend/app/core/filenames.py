import re
from ipaddress import ip_address

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(name: str, fallback: str = "export.csv") -> str:
    cleaned = _UNSAFE.sub("_", (name or "").replace("\\", "/").split("/")[-1])
    cleaned = cleaned.strip("._")
    if not cleaned or cleaned in {".", ".."}:
        return fallback
    return cleaned[:120]


def parse_ip_or_400(value: str) -> str:
    try:
        return str(ip_address(value.strip()))
    except Exception as exc:
        raise ValueError("Invalid IP address") from exc
