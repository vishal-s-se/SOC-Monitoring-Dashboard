import json
import os
from pathlib import Path
from typing import Any


class PersistentState:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.data: dict[str, Any] = {}
        self._load()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(json.dumps(self.data, sort_keys=True), encoding="utf-8")
        os.replace(temporary, self.path)

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(value, dict):
                self.data = value
        except (OSError, ValueError, TypeError):
            self.data = {}
