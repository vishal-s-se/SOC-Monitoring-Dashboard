import logging

from agents.common.buffer import PersistentEventBuffer
from agents.common.client import AgentClient
from agents.common.config import AgentConfig
from agents.common.identity import AgentIdentity
from agents.common.runner import AgentRunner
from agents.common.state import PersistentState
from agents.common.transport import CollectorTransport
from agents.windows.collector import WindowsEventCollector


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    config = AgentConfig.from_environment()
    identity = AgentIdentity.load(config)
    state = PersistentState(config.buffer_path.with_name("source-state.json"))
    collector = WindowsEventCollector(identity, state=state.data.setdefault("windows", {}))
    sources = config.enabled_sources or {"security", "system", "application"}

    def collect():
        events = collector.collect(set(sources))
        state.save()
        return events

    runner = AgentRunner(
        AgentClient(config, identity, CollectorTransport(config)),
        PersistentEventBuffer(config.buffer_path, config.buffer_size),
        [collect],
    )
    runner.run_forever()


if __name__ == "__main__":
    main()
