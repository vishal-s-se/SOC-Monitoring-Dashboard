
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from collector.app.config import settings

async def main():
    try:
        engine = create_async_engine(settings.DATABASE_URL, echo=False)
        AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            print("DB Connection OK")
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())

