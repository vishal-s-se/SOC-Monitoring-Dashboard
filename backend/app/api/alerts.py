from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.db.session import get_db
from backend.app.models.alert import Alert
from backend.app.engine.alerter import AlertService

router = APIRouter()

@router.get("/alerts")
async def list_alerts(db: AsyncSession = Depends(get_db)):
    stmt = select(Alert).order_by(Alert.last_seen.desc())
    result = await db.execute(stmt)
    alerts = result.scalars().all()
    return {"status": "ok", "alerts": alerts}

@router.get("/alerts/{alert_id}")
async def retrieve_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Alert).where(Alert.alert_id == alert_id)
    result = await db.execute(stmt)
    alert = result.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "ok", "alert": alert}

@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await AlertService.acknowledge_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found or invalid transition")
    await db.commit()
    return {"status": "ok", "message": "Alert acknowledged", "alert": alert}

@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await AlertService.resolve_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found or invalid transition")
    await db.commit()
    return {"status": "ok", "message": "Alert resolved", "alert": alert}
