import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(user='postgres', password='Vishal@2006', database='soc_monitor', host='127.0.0.1')
    
    print("--- RAW LOGS ---")
    rows = await conn.fetch("SELECT id, agent_id, source_type FROM raw_log ORDER BY timestamp DESC LIMIT 5")
    for r in rows: print(dict(r))

    print("\n--- EVENTS ---")
    rows = await conn.fetch("SELECT id, event_category, event_type, action, severity, source_ip, destination_ip FROM event ORDER BY timestamp DESC LIMIT 5")
    for r in rows: print(dict(r))

    print("\n--- ALERTS ---")
    rows = await conn.fetch("SELECT id, rule_id, status, severity, title FROM alert ORDER BY created_at DESC LIMIT 5")
    for r in rows: print(dict(r))
    
    await conn.close()

asyncio.run(main())
