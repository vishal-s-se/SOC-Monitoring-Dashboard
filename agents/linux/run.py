import logging

from agents.common.buffer import PersistentEventBuffer
from agents.common.client import AgentClient
from agents.common.config import AgentConfig
from agents.common.identity import AgentIdentity
from agents.common.runner import AgentRunner
from agents.common.state import PersistentState
from agents.common.transport import CollectorTransport
from agents.linux.collector import JournaldCollector, LinuxLogCollector


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    config = AgentConfig.from_environment()
    identity = AgentIdentity.load(config)
    client = AgentClient(config, identity, CollectorTransport(config))
    state = PersistentState(config.buffer_path.with_name("source-state.json"))
    file_collector = LinuxLogCollector(identity, state=state.data.setdefault("files", {}))
    journald_collector = JournaldCollector(identity, cursor=state.data.get("journald_cursor"))

    def collect_files():
        events = file_collector.collect()
        state.save()
        return events

    def collect_journald():
        events = journald_collector.collect()
        state.data["journald_cursor"] = journald_collector.cursor
        state.save()
        return events

    sources = [collect_files]
    if not config.enabled_sources or "journald" in config.enabled_sources:
        sources.append(collect_journald)
    runner = AgentRunner(client, PersistentEventBuffer(config.buffer_path, config.buffer_size), sources)
    runner.run_forever()


if __name__ == "__main__":
    main()
