import json
import os
import tempfile
import logging

logger = logging.getLogger(__name__)

class StateManager:
    def __init__(self, state_dir):
        self.state_dir = state_dir
        if not os.path.exists(self.state_dir):
            try:
                os.makedirs(self.state_dir, mode=0o700, exist_ok=True)
                os.chmod(self.state_dir, 0o700)
            except Exception as e:
                logger.error(f"Failed to create state directory: {e}")

    def _get_path(self, source_name):
        safe_name = "".join(c if c.isalnum() else "_" for c in source_name)
        return os.path.join(self.state_dir, f"{safe_name}.json")

    def get_state(self, source_name, default=None):
        path = self._get_path(source_name)
        if not os.path.exists(path):
            return default
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read state for {source_name}: {e}")
            return default

    def set_state(self, source_name, state_dict):
        path = self._get_path(source_name)
        temp_fd, temp_path = tempfile.mkstemp(dir=self.state_dir)
        try:
            with os.fdopen(temp_fd, "w", encoding="utf-8") as f:
                json.dump(state_dict, f)
            os.chmod(temp_path, 0o600)
            # Atomic replace
            os.replace(temp_path, path)
        except Exception as e:
            logger.error(f"Failed to write state for {source_name}: {e}")
            if os.path.exists(temp_path):
                os.unlink(temp_path)
