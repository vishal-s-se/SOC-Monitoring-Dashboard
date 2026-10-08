import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text

from backend.app.models.agent import Agent
from backend.app.models.raw_log import RawLog

async def run():
    url = "postgresql+asyncpg://postgres:Vishal%402006@localhost:5432/soc_monitor_test"
    engine = create_async_engine(url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        result = await session.execute(select(Agent))
        agents = result.scalars().all()
        print(f"Agents ({len(agents)}):")
        for a in agents:
            print(f" - {a.hostname} / {a.agent_version} / {a.status} / {a.last_heartbeat}")

        result = await session.execute(select(RawLog))
        logs = result.scalars().all()
        print(f"\nRaw Logs ({len(logs)}):")
        for l in logs[:5]:
            print(f" - {l.source_type}: {str(l.raw_payload)[:100]}")

asyncio.run(run())
