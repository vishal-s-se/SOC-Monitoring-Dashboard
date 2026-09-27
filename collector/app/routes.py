from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import uuid
import datetime

from collector.app.dependencies import get_db, verify_agent_auth
from collector.app.schemas import AgentRegistration, HeartbeatRequest, EventRequest

# Reuse Phase 2 Models
from backend.app.models.agent import Agent
from backend.app.models.host import Host
from backend.app.models.heartbeat import Heartbeat
from backend.app.models.raw_log import RawLog
from backend.app.engine.event_bus import event_bus

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_agent(
    registration: AgentRegistration,
    db: AsyncSession = Depends(get_db),
    auth: str = Depends(verify_agent_auth)
):
    stmt = select(Agent).where(Agent.agent_id == registration.agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()

    if agent:
        old_status = agent.status
        agent.hostname = registration.hostname
        agent.operating_system = registration.operating_system
        agent.agent_version = registration.agent_version
        agent.ip_address = registration.ip_address
        agent.metadata_ = registration.metadata_
        agent.status = "ONLINE"
        await db.commit()

        if old_status != "ONLINE":
            await event_bus.publish("agent_status_changed", {
                "agent_id": agent.agent_id,
                "hostname": agent.hostname,
                "status": "ONLINE",
                "previous_status": old_status
            })

        return {"status": "ok", "message": "Agent updated", "agent_id": agent.agent_id}

    stmt = select(Host).where(Host.hostname == registration.hostname)
    result = await db.execute(stmt)
    host = result.scalar_one_or_none()

    if not host:
        host = Host(
            host_identifier=str(uuid.uuid4()),
            hostname=registration.hostname,
            operating_system=registration.operating_system,
            ip_address=registration.ip_address
        )
        db.add(host)
        await db.commit()
        await db.refresh(host)

        await event_bus.publish("host_status_changed", {
            "host_id": host.id,
            "hostname": host.hostname,
            "status": host.status
        })

    new_agent = Agent(
        agent_id=registration.agent_id,
        host_id=host.id,
        hostname=registration.hostname,
        operating_system=registration.operating_system,
        agent_version=registration.agent_version,
        ip_address=registration.ip_address,
        metadata_=registration.metadata_,
        status="ONLINE"
    )
    db.add(new_agent)
    await db.commit()

    await event_bus.publish("agent_status_changed", {
        "agent_id": new_agent.agent_id,
        "hostname": new_agent.hostname,
        "status": new_agent.status,
        "previous_status": "UNREGISTERED"
    })

    return {"status": "ok", "message": "Agent registered successfully", "agent_id": new_agent.agent_id}

@router.post("/heartbeat")
async def receive_heartbeat(
    heartbeat_req: HeartbeatRequest,
    db: AsyncSession = Depends(get_db),
    auth: str = Depends(verify_agent_auth)
):
    stmt = select(Agent).where(Agent.agent_id == heartbeat_req.agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found. Please register first."
        )

    old_status = agent.status
    agent.last_heartbeat = heartbeat_req.timestamp
    agent.status = heartbeat_req.connection_status
    if heartbeat_req.ip_address:
        agent.ip_address = heartbeat_req.ip_address

    hb = Heartbeat(
        agent_id=agent.id,
        host_id=agent.host_id,
        timestamp=heartbeat_req.timestamp,
        status=heartbeat_req.connection_status,
        ip_address=heartbeat_req.ip_address,
        agent_version=heartbeat_req.agent_version,
        metadata_=heartbeat_req.metadata_
    )
    db.add(hb)
    await db.commit()

    if old_status != heartbeat_req.connection_status:
        await event_bus.publish("agent_status_changed", {
            "agent_id": agent.agent_id,
            "hostname": agent.hostname,
            "status": agent.status,
            "previous_status": old_status
        })

    return {"status": "ok"}

from collector.app.pipeline import process_event

@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def receive_event(
    event_req: EventRequest,
    db: AsyncSession = Depends(get_db),
    auth: str = Depends(verify_agent_auth)
):
    stmt = select(Agent).where(Agent.agent_id == event_req.agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found. Please register first."
        )

    return await process_event(event_req, agent, db)
