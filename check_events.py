import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(user='postgres', password='Vishal@2006', database='soc_monitor', host='127.0.0.1')
    rows = await conn.fetch("SELECT event_category, event_type, action, username, raw_log_id FROM event ORDER BY timestamp DESC LIMIT 3")
    for r in rows:
        print(dict(r))
    await conn.close()

asyncio.run(main())
