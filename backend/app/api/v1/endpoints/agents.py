from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional, List

from backend.app.db.session import get_db
from backend.app.models.agent import Agent as AgentModel
from backend.app.schemas.agent import Agent
from backend.app.schemas.pagination import PaginatedResponse

router = APIRouter()
public_router = APIRouter()

@router.get("/", response_model=PaginatedResponse[Agent])
async def list_agents(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    operating_system: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AgentModel)

    if status:
        stmt = stmt.where(AgentModel.status == status)
    if operating_system:
        stmt = stmt.where(AgentModel.operating_system == operating_system)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(AgentModel.registered_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    from datetime import datetime, timezone, timedelta

    result = await db.execute(stmt)
    db_items = result.scalars().all()
    
    # Calculate accurate status based on last_heartbeat (5 min threshold)
    items = []
    now = datetime.now(timezone.utc)
    for agent in db_items:
        # Pydantic schemas will be built from these objects. 
        # We can dynamically override the status before it gets serialized if we modify the object.
        # But mutating the SQLAlchemy object might mark it dirty. Let's just update the status logic.
        if agent.last_heartbeat is None:
            computed_status = "UNKNOWN"
        else:
            # Ensure timezone awareness for comparison
            hb_time = agent.last_heartbeat if agent.last_heartbeat.tzinfo else agent.last_heartbeat.replace(tzinfo=timezone.utc)
            if now - hb_time > timedelta(minutes=5):
                computed_status = "OFFLINE"
            else:
                computed_status = "ONLINE"
                
        # We temporarily set the status attribute so it serializes correctly.
        agent.status = computed_status
        items.append(agent)

    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )

@router.get("/{id}", response_model=Agent)
async def get_agent(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AgentModel).where(AgentModel.id == id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    if agent.last_heartbeat is None:
        agent.status = "UNKNOWN"
    else:
        hb_time = agent.last_heartbeat if agent.last_heartbeat.tzinfo else agent.last_heartbeat.replace(tzinfo=timezone.utc)
        if now - hb_time > timedelta(minutes=5):
            agent.status = "OFFLINE"
        else:
            agent.status = "ONLINE"
            
    return agent


@router.patch("/{id}/retire", status_code=200)
async def retire_agent(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Soft-retire an agent in SOC Monitor. Marks it RETIRED and records the action.
    This does NOT uninstall the software from the endpoint.
    Historical events, logs, and investigations are preserved.
    The running agent will continue sending heartbeats but be ignored by dashboards once retired.
    """
    result = await db.execute(select(AgentModel).where(AgentModel.id == id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.status == "RETIRED":
        raise HTTPException(status_code=409, detail="Agent is already retired.")

    prev_status = agent.status
    agent.status = "RETIRED"
    await db.commit()

    from backend.app.core.audit import audit
    from backend.app.engine.event_bus import event_bus
    audit(
        "agent_retired",
        actor="dashboard_user",
        outcome="success",
        agent_id=agent.agent_id,
        hostname=agent.hostname,
        previous_status=prev_status,
    )
    await event_bus.publish("agent_status_changed", {
        "agent_id": agent.agent_id,
        "hostname": agent.hostname,
        "status": "RETIRED",
        "previous_status": prev_status,
    })

    return {
        "status": "retired",
        "agent_id": agent.agent_id,
        "hostname": agent.hostname,
        "note": "Agent retired in SOC Monitor. Historical data preserved. Uninstall the agent software locally to stop collection.",
    }


from pydantic import BaseModel

class BulkRetireRequest(BaseModel):
    agent_ids: Optional[List[str]] = None  # If provided, retire specific agent_ids, otherwise all eligible non-retired


@router.post("/retire-all", status_code=200)
async def retire_all_agents(
    payload: Optional[BulkRetireRequest] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Safely bulk-retire eligible, non-retired agents in SOC Monitor.
    Soft-retires each agent (setting status='RETIRED') and records audit history.
    Does not delete endpoint software, events, or investigation history.
    """
    stmt = select(AgentModel).where(AgentModel.status != "RETIRED")
    if payload and payload.agent_ids:
        stmt = stmt.where(AgentModel.agent_id.in_(payload.agent_ids))

    result = await db.execute(stmt)
    agents_to_retire = result.scalars().all()

    if not agents_to_retire:
        return {
            "status": "no_action",
            "message": "No eligible non-retired agents found to retire.",
            "retired_count": 0,
            "retired_agent_ids": []
        }

    from backend.app.core.audit import audit
    from backend.app.engine.event_bus import event_bus

    retired_ids = []
    for agent in agents_to_retire:
        prev_status = agent.status
        agent.status = "RETIRED"
        retired_ids.append(agent.agent_id)

        audit(
            "agent_retired",
            actor="dashboard_admin",
            outcome="success",
            agent_id=agent.agent_id,
            hostname=agent.hostname,
            previous_status=prev_status,
            bulk_operation=True
        )

        await event_bus.publish("agent_status_changed", {
            "agent_id": agent.agent_id,
            "hostname": agent.hostname,
            "status": "RETIRED",
            "previous_status": prev_status,
        })

    await db.commit()

    return {
        "status": "success",
        "message": f"Successfully retired {len(retired_ids)} agents.",
        "retired_count": len(retired_ids),
        "retired_agent_ids": retired_ids
    }


from backend.app.models.enrollment import EnrollmentCode
import uuid
import hashlib
import datetime

@router.post("/enrollment-code")
async def create_enrollment_code(
    target_os: str = Query(..., description="windows or linux"),
    db: AsyncSession = Depends(get_db)
):
    code = str(uuid.uuid4())
    code_hash = hashlib.sha256(code.encode()).hexdigest()
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)
    
    ec = EnrollmentCode(
        code_hash=code_hash,
        target_os=target_os,
        expires_at=expires_at
    )
    db.add(ec)
    await db.commit()
    
    return {"enrollment_code": code, "expires_at": expires_at, "target_os": target_os}

from fastapi.responses import FileResponse
import os

@public_router.get("/download/{os_type:path}")
async def download_agent(os_type: str):
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../artifacts"))
    
    if os_type == "windows":
        file_path = os.path.join(base_dir, "soc-agent-windows.zip")
        filename = "soc-agent-windows.zip"
    elif os_type == "linux":
        file_path = os.path.join(base_dir, "soc-monitor-agent_0.1.0_amd64.deb")
        filename = "soc-monitor-agent_0.1.0_amd64.deb"
    elif os_type == "script/windows/install":
        file_path = os.path.join(base_dir, "Install-SOCAgent.ps1")
        filename = "Install-SOCAgent.ps1"
    elif os_type == "script/windows/uninstall":
        file_path = os.path.join(base_dir, "Uninstall-SOCAgent.ps1")
        filename = "Uninstall-SOCAgent.ps1"
    else:
        raise HTTPException(status_code=400, detail="Invalid OS type")
        
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Artifact not found. Please build and place it in the artifacts directory.")
        
    return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream")
