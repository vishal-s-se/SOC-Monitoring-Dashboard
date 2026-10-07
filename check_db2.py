import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(user='postgres', password='Vishal@2006', database='soc_monitor', host='127.0.0.1')
    
    print("\n--- ALERTS ---")
    rows = await conn.fetch("SELECT id, alert_id, title, status, severity, first_seen, last_seen, occurrence_count FROM alert ORDER BY first_seen DESC LIMIT 5")
    for r in rows: print(dict(r))
    
    await conn.close()

asyncio.run(main())
