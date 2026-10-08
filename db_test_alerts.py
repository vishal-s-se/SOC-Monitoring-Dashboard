import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text

from backend.app.models.alert import Alert

async def run():
    url = "postgresql+asyncpg://postgres:Vishal%402006@localhost:5432/soc_monitor_test"
    engine = create_async_engine(url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        result = await session.execute(select(Alert))
        alerts = result.scalars().all()
        print(f"Alerts ({len(alerts)}):")
        for a in alerts:
            print(f" - {a.title} ({a.severity})")

asyncio.run(run())
