import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import selectinload

from backend.app.db.session import get_db
from backend.app.models.mitre import (
    MitreTactic as MitreTacticModel,
    MitreTechnique as MitreTechniqueModel,
    MitreTechniqueTactic as MitreTechniqueTacticModel,
    MitreMapping as MitreMappingModel,
    MitreTargetType,
    MitreMappingSource,
    MitreConfidence
)
from backend.app.models.detection import DetectionRule as DetectionRuleModel
from backend.app.models.alert import Alert as AlertModel
from backend.app.models.investigation import Investigation as InvestigationModel
from backend.app.models.event import Event as EventModel
from backend.app.schemas.mitre import (
    MitreTactic,
    MitreTacticSummary,
    MitreTechniqueSummary,
    MitreTechniqueDetail,
    MitreMapping,
    MitreMappingCreate,
    MITRE_TECHNIQUE_ID_REGEX
)
from backend.app.schemas.pagination import PaginatedResponse
from backend.app.services.mitre_seeder import seed_mitre_catalog

logger = logging.getLogger(__name__)

router = APIRouter()

# --- TACTICS ---

@router.get("/tactics", response_model=List[MitreTactic])
async def list_tactics(db: AsyncSession = Depends(get_db)):
    """List all MITRE ATT&CK tactics ordered by official matrix flow."""
    stmt = select(MitreTacticModel).order_by(MitreTacticModel.order_index.asc())
    result = await db.execute(stmt)
    return result.scalars().all()


# --- TECHNIQUES ---

@router.get("/techniques", response_model=PaginatedResponse[MitreTechniqueSummary])
async def list_techniques(
    search: Optional[str] = Query(None, description="Search by technique ID or name"),
    technique_id: Optional[str] = Query(None, description="Filter by exact technique ID"),
    tactic: Optional[str] = Query(None, description="Filter by tactic ID (e.g. TA0002) or name"),
    is_subtechnique: Optional[bool] = Query(None, description="Filter by subtechnique boolean"),
    parent_technique_id: Optional[str] = Query(None, description="Filter by parent technique ID"),
    is_deprecated: Optional[bool] = Query(False, description="Exclude or include deprecated techniques"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Search and filter Enterprise MITRE ATT&CK techniques with server-side pagination.
    """
    stmt = (
        select(MitreTechniqueModel)
        .options(
            selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic),
            selectinload(MitreTechniqueModel.mappings)
        )
    )

    if is_deprecated is not None:
        stmt = stmt.where(MitreTechniqueModel.is_deprecated == is_deprecated)

    if technique_id:
        cleaned_tid = technique_id.strip().upper()
        stmt = stmt.where(MitreTechniqueModel.technique_id == cleaned_tid)

    if parent_technique_id:
        cleaned_parent = parent_technique_id.strip().upper()
        stmt = stmt.where(MitreTechniqueModel.parent_technique_id == cleaned_parent)

    if is_subtechnique is not None:
        stmt = stmt.where(MitreTechniqueModel.is_subtechnique == is_subtechnique)

    if tactic:
        tactic_clean = tactic.strip().upper()
        # Find matching techniques that belong to this tactic_id or tactic name
        tactic_subquery = (
            select(MitreTechniqueTacticModel.technique_id)
            .join(MitreTacticModel, MitreTechniqueTacticModel.tactic_id == MitreTacticModel.tactic_id)
            .where(
                or_(
                    MitreTacticModel.tactic_id == tactic_clean,
                    MitreTacticModel.name.ilike(f"%{tactic.strip()}%")
                )
            )
        )
        stmt = stmt.where(MitreTechniqueModel.technique_id.in_(tactic_subquery))

    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                MitreTechniqueModel.technique_id.ilike(s),
                MitreTechniqueModel.name.ilike(s),
                MitreTechniqueModel.description.ilike(s)
            )
        )

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Pagination & Ordering: techniques ordered by technique_id
    stmt = stmt.order_by(MitreTechniqueModel.technique_id.asc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    techniques = result.scalars().all()

    # Format response items
    items = []
    for t in techniques:
        tactic_summaries = [
            MitreTacticSummary(
                tactic_id=tt.tactic.tactic_id,
                name=tt.tactic.name,
                order_index=tt.tactic.order_index
            )
            for tt in t.tactics if tt.tactic
        ]
        # Sort tactics by order_index
        tactic_summaries.sort(key=lambda x: x.order_index)

        items.append(
            MitreTechniqueSummary(
                id=t.id,
                technique_id=t.technique_id,
                name=t.name,
                is_subtechnique=t.is_subtechnique,
                parent_technique_id=t.parent_technique_id,
                platforms=t.platforms,
                is_deprecated=t.is_deprecated,
                tactics=tactic_summaries,
                mapping_count=len(t.mappings) if t.mappings else 0
            )
        )

    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )


@router.get("/techniques/{technique_id}", response_model=MitreTechniqueDetail)
async def get_technique_detail(technique_id: str, db: AsyncSession = Depends(get_db)):
    """
    Retrieve full details for a technique, including tactics, sub-techniques or parent technique,
    and all mapped detection rules, alerts, investigations, and events.
    """
    cleaned_id = technique_id.strip().upper()
    if not MITRE_TECHNIQUE_ID_REGEX.match(cleaned_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MITRE Technique ID format: '{technique_id}'. Must match Txxxx or Txxxx.xxx"
        )

    stmt = (
        select(MitreTechniqueModel)
        .options(
            selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic),
            selectinload(MitreTechniqueModel.mappings)
        )
        .where(MitreTechniqueModel.technique_id == cleaned_id)
    )
    res = await db.execute(stmt)
    tech = res.scalars().first()
    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MITRE Technique '{cleaned_id}' not found in Enterprise ATT&CK catalog"
        )

    # Fetch tactics
    tactic_summaries = [
        MitreTacticSummary(
            tactic_id=tt.tactic.tactic_id,
            name=tt.tactic.name,
            order_index=tt.tactic.order_index
        )
        for tt in tech.tactics if tt.tactic
    ]
    tactic_summaries.sort(key=lambda x: x.order_index)

    # Fetch parent technique if this is a sub-technique
    parent_summary = None
    if tech.parent_technique_id:
        p_stmt = select(MitreTechniqueModel).where(MitreTechniqueModel.technique_id == tech.parent_technique_id)
        p_res = await db.execute(p_stmt)
        p_obj = p_res.scalars().first()
        if p_obj:
            parent_summary = MitreTechniqueSummary(
                id=p_obj.id,
                technique_id=p_obj.technique_id,
                name=p_obj.name,
                is_subtechnique=p_obj.is_subtechnique,
                parent_technique_id=p_obj.parent_technique_id,
                platforms=p_obj.platforms,
                is_deprecated=p_obj.is_deprecated,
                tactics=[],
                mapping_count=0
            )

    # Fetch subtechniques if this is a parent technique
    subtechnique_summaries = []
    if not tech.is_subtechnique:
        sub_stmt = (
            select(MitreTechniqueModel)
            .options(selectinload(MitreTechniqueModel.mappings))
            .where(MitreTechniqueModel.parent_technique_id == tech.technique_id)
            .order_by(MitreTechniqueModel.technique_id.asc())
        )
        sub_res = await db.execute(sub_stmt)
        for sub in sub_res.scalars().all():
            subtechnique_summaries.append(
                MitreTechniqueSummary(
                    id=sub.id,
                    technique_id=sub.technique_id,
                    name=sub.name,
                    is_subtechnique=sub.is_subtechnique,
                    parent_technique_id=sub.parent_technique_id,
                    platforms=sub.platforms,
                    is_deprecated=sub.is_deprecated,
                    tactics=[],
                    mapping_count=len(sub.mappings) if sub.mappings else 0
                )
            )

    # Fetch mapped entities (traceable evidence-based relationships)
    mapped_rules = []
    mapped_alerts = []
    mapped_invs = []
    mapped_events = []

    for m in (tech.mappings or []):
        mapping_meta = {
            "mapping_id": m.id,
            "mapping_source": m.mapping_source,
            "confidence": m.confidence,
            "evidence_reference": m.evidence_reference,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "target_id": m.target_id
        }

        if m.target_type == MitreTargetType.DETECTION_RULE.value:
            if m.target_id.isdigit():
                rule_res = await db.execute(select(DetectionRuleModel).where(DetectionRuleModel.id == int(m.target_id)))
            else:
                rule_res = await db.execute(select(DetectionRuleModel).where(DetectionRuleModel.rule_id == m.target_id))
            r = rule_res.scalars().first()
            if r:
                mapping_meta.update({
                    "id": r.id,
                    "rule_id": r.rule_id,
                    "name": r.name,
                    "severity": r.severity,
                    "enabled": r.enabled
                })
            mapped_rules.append(mapping_meta)

        elif m.target_type == MitreTargetType.ALERT.value:
            if m.target_id.isdigit():
                alert_res = await db.execute(select(AlertModel).where(AlertModel.id == int(m.target_id)))
            else:
                alert_res = await db.execute(select(AlertModel).where(AlertModel.alert_id == m.target_id))
            a = alert_res.scalars().first()
            if a:
                mapping_meta.update({
                    "id": a.id,
                    "alert_id": a.alert_id,
                    "title": a.title,
                    "severity": a.severity,
                    "status": a.status,
                    "last_seen": a.last_seen.isoformat() if a.last_seen else None
                })
            mapped_alerts.append(mapping_meta)

        elif m.target_type == MitreTargetType.INVESTIGATION.value:
            if m.target_id.isdigit():
                inv_res = await db.execute(select(InvestigationModel).where(InvestigationModel.id == int(m.target_id)))
                inv_obj = inv_res.scalars().first()
                if inv_obj:
                    mapping_meta.update({
                        "id": inv_obj.id,
                        "title": inv_obj.title,
                        "status": inv_obj.status,
                        "severity": inv_obj.severity
                    })
            mapped_invs.append(mapping_meta)

        elif m.target_type == MitreTargetType.EVENT.value:
            if m.target_id.isdigit():
                ev_res = await db.execute(select(EventModel).where(EventModel.id == int(m.target_id)))
            else:
                ev_res = await db.execute(select(EventModel).where(EventModel.event_id == m.target_id))
            ev_obj = ev_res.scalars().first()
            if ev_obj:
                mapping_meta.update({
                    "id": ev_obj.id,
                    "event_id": ev_obj.event_id,
                    "event_type": ev_obj.event_type,
                    "event_category": ev_obj.event_category,
                    "severity": ev_obj.severity,
                    "hostname": ev_obj.hostname,
                    "timestamp": ev_obj.timestamp.isoformat() if ev_obj.timestamp else None
                })
            mapped_events.append(mapping_meta)

    return MitreTechniqueDetail(
        id=tech.id,
        technique_id=tech.technique_id,
        name=tech.name,
        description=tech.description,
        is_subtechnique=tech.is_subtechnique,
        parent_technique_id=tech.parent_technique_id,
        platforms=tech.platforms,
        data_sources=tech.data_sources,
        is_deprecated=tech.is_deprecated,
        dataset_version=tech.dataset_version,
        created_at=tech.created_at,
        updated_at=tech.updated_at,
        tactics=tactic_summaries,
        subtechniques=subtechnique_summaries,
        parent_technique=parent_summary,
        detection_rules=mapped_rules,
        alerts=mapped_alerts,
        investigations=mapped_invs,
        events=mapped_events
    )


# --- MAPPINGS ---

@router.get("/mappings", response_model=List[MitreMapping])
async def list_mappings(
    target_type: Optional[MitreTargetType] = Query(None, description="Target entity type"),
    target_id: Optional[str] = Query(None, description="Target entity ID"),
    technique_id: Optional[str] = Query(None, description="Filter by MITRE technique ID"),
    mapping_source: Optional[MitreMappingSource] = Query(None, description="Filter by mapping source"),
    include_inherited: bool = Query(True, description="When querying an ALERT, include mappings inherited from its Detection Rule"),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve MITRE technique mappings associated with SOC entities (rules, alerts, investigations, events).
    For alerts, optionally includes mappings inherited from the associated detection rule.
    """
    stmt = (
        select(MitreMappingModel)
        .options(
            selectinload(MitreMappingModel.technique)
            .selectinload(MitreTechniqueModel.tactics)
            .selectinload(MitreTechniqueTacticModel.tactic)
        )
    )

    if target_type:
        stmt = stmt.where(MitreMappingModel.target_type == target_type.value)
    if target_id:
        stmt = stmt.where(MitreMappingModel.target_id == str(target_id))
    if technique_id:
        cleaned_tid = technique_id.strip().upper()
        stmt = stmt.where(MitreMappingModel.technique_id == cleaned_tid)
    if mapping_source:
        stmt = stmt.where(MitreMappingModel.mapping_source == mapping_source.value)

    stmt = stmt.order_by(MitreMappingModel.created_at.desc())
    res = await db.execute(stmt)
    mappings = res.scalars().all()

    result_items = []
    seen_keys = set()

    for m in mappings:
        tactics = []
        tech_name = None
        if m.technique:
            tech_name = m.technique.name
            tactics = [
                MitreTacticSummary(
                    tactic_id=tt.tactic.tactic_id,
                    name=tt.tactic.name,
                    order_index=tt.tactic.order_index
                )
                for tt in m.technique.tactics if tt.tactic
            ]
            tactics.sort(key=lambda x: x.order_index)

        seen_keys.add((m.technique_id, m.target_type, m.target_id))
        result_items.append(
            MitreMapping(
                id=m.id,
                technique_id=m.technique_id,
                technique_name=tech_name,
                tactics=tactics,
                target_type=m.target_type,
                target_id=m.target_id,
                mapping_source=m.mapping_source,
                confidence=m.confidence,
                evidence_reference=m.evidence_reference,
                notes=m.notes,
                created_by=m.created_by,
                created_at=m.created_at,
                updated_at=m.updated_at,
                is_inherited=False
            )
        )

    # If querying a specific ALERT with include_inherited=True, fetch mappings from its Detection Rule
    if target_type == MitreTargetType.ALERT and target_id and include_inherited:
        # Find the alert's rule_id
        target_id_str = str(target_id).strip()
        if target_id_str.isdigit():
            al_res = await db.execute(select(AlertModel).where(AlertModel.id == int(target_id_str)))
        else:
            al_res = await db.execute(select(AlertModel).where(AlertModel.alert_id == target_id_str))
        alert_obj = al_res.scalars().first()

        if alert_obj and alert_obj.rule_id:
            # Query detection rule mappings for this rule
            # Rule target_id in mappings could be string of rule.id or rule.rule_id
            rule_id_candidates = [str(alert_obj.rule_id)]
            # Find DetectionRule entity to also check rule_id string
            rule_lookup = await db.execute(select(DetectionRuleModel).where(DetectionRuleModel.id == alert_obj.rule_id))
            rule_ent = rule_lookup.scalars().first()
            if rule_ent and rule_ent.rule_id:
                rule_id_candidates.append(str(rule_ent.rule_id))

            rule_stmt = (
                select(MitreMappingModel)
                .options(
                    selectinload(MitreMappingModel.technique)
                    .selectinload(MitreTechniqueModel.tactics)
                    .selectinload(MitreTechniqueTacticModel.tactic)
                )
                .where(
                    MitreMappingModel.target_type == MitreTargetType.DETECTION_RULE.value,
                    MitreMappingModel.target_id.in_(rule_id_candidates)
                )
            )
            rule_mappings_res = await db.execute(rule_stmt)
            rule_mappings = rule_mappings_res.scalars().all()

            for rm in rule_mappings:
                # Do not duplicate if alert already directly mapped this technique
                if any(it.technique_id == rm.technique_id for it in result_items):
                    continue

                tactics = []
                tech_name = None
                if rm.technique:
                    tech_name = rm.technique.name
                    tactics = [
                        MitreTacticSummary(
                            tactic_id=tt.tactic.tactic_id,
                            name=tt.tactic.name,
                            order_index=tt.tactic.order_index
                        )
                        for tt in rm.technique.tactics if tt.tactic
                    ]
                    tactics.sort(key=lambda x: x.order_index)

                result_items.append(
                    MitreMapping(
                        id=rm.id,
                        technique_id=rm.technique_id,
                        technique_name=tech_name,
                        tactics=tactics,
                        target_type=MitreTargetType.ALERT.value,
                        target_id=target_id_str,
                        mapping_source=rm.mapping_source,
                        confidence=rm.confidence,
                        evidence_reference=f"Inherited from Rule {rm.target_id}",
                        notes=rm.notes,
                        created_by=rm.created_by,
                        created_at=rm.created_at,
                        updated_at=rm.updated_at,
                        is_inherited=True
                    )
                )

    return result_items


@router.post("/mappings", response_model=MitreMapping, status_code=status.HTTP_201_CREATED)
async def create_mapping(mapping_in: MitreMappingCreate, db: AsyncSession = Depends(get_db)):
    """
    Explicitly map a MITRE technique to a detection rule, alert, investigation, or event.
    Verifies technique existence, target validity, and duplicate prevention.
    """
    # 1. Verify technique exists
    cleaned_tid = mapping_in.technique_id.strip().upper()
    tech_stmt = select(MitreTechniqueModel).where(MitreTechniqueModel.technique_id == cleaned_tid)
    tech_res = await db.execute(tech_stmt)
    tech = tech_res.scalars().first()
    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MITRE Technique '{cleaned_tid}' does not exist in the Enterprise ATT&CK catalog"
        )

    # 2. Verify target entity exists
    target_id_str = str(mapping_in.target_id).strip()
    if mapping_in.target_type == MitreTargetType.DETECTION_RULE:
        if target_id_str.isdigit():
            target_res = await db.execute(select(DetectionRuleModel).where(DetectionRuleModel.id == int(target_id_str)))
        else:
            target_res = await db.execute(select(DetectionRuleModel).where(DetectionRuleModel.rule_id == target_id_str))
        if not target_res.scalars().first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Detection Rule '{target_id_str}' not found")

    elif mapping_in.target_type == MitreTargetType.ALERT:
        if target_id_str.isdigit():
            target_res = await db.execute(select(AlertModel).where(AlertModel.id == int(target_id_str)))
        else:
            target_res = await db.execute(select(AlertModel).where(AlertModel.alert_id == target_id_str))
        if not target_res.scalars().first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alert '{target_id_str}' not found")

    elif mapping_in.target_type == MitreTargetType.INVESTIGATION:
        if not target_id_str.isdigit():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Investigation target ID must be an integer ID")
        target_res = await db.execute(select(InvestigationModel).where(InvestigationModel.id == int(target_id_str)))
        if not target_res.scalars().first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Investigation #{target_id_str} not found")

    elif mapping_in.target_type == MitreTargetType.EVENT:
        if target_id_str.isdigit():
            target_res = await db.execute(select(EventModel).where(EventModel.id == int(target_id_str)))
        else:
            target_res = await db.execute(select(EventModel).where(EventModel.event_id == target_id_str))
        if not target_res.scalars().first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Event '{target_id_str}' not found")

    # 3. Check for duplicate mapping
    dup_stmt = select(MitreMappingModel).where(
        MitreMappingModel.technique_id == cleaned_tid,
        MitreMappingModel.target_type == mapping_in.target_type.value,
        MitreMappingModel.target_id == target_id_str
    )
    dup_res = await db.execute(dup_stmt)
    existing_mapping = dup_res.scalars().first()
    if existing_mapping:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Mapping for {cleaned_tid} on {mapping_in.target_type.value} '{target_id_str}' already exists"
        )

    # 4. Create mapping
    new_mapping = MitreMappingModel(
        technique_id=cleaned_tid,
        target_type=mapping_in.target_type.value,
        target_id=target_id_str,
        mapping_source=mapping_in.mapping_source.value,
        confidence=mapping_in.confidence.value,
        evidence_reference=mapping_in.evidence_reference,
        notes=mapping_in.notes,
        created_by=mapping_in.created_by or "analyst"
    )
    db.add(new_mapping)
    await db.commit()
    await db.refresh(new_mapping)

    # Broadcast WebSocket updates
    try:
        from backend.app.engine.event_bus import event_bus
        payload = {
            "id": new_mapping.id,
            "technique_id": new_mapping.technique_id,
            "target_type": new_mapping.target_type,
            "target_id": new_mapping.target_id,
            "confidence": new_mapping.confidence,
            "mapping_source": new_mapping.mapping_source
        }
        await event_bus.publish("mitre_mapping_created", payload)
        if new_mapping.target_type == MitreTargetType.INVESTIGATION.value:
            await event_bus.publish("investigation_mitre_mapping_added", {
                "investigation_id": int(new_mapping.target_id),
                "mapping_id": new_mapping.id,
                "technique_id": new_mapping.technique_id,
                "confidence": new_mapping.confidence,
                "mapping_source": new_mapping.mapping_source
            })
    except Exception:
        pass

    # Fetch tactics for response
    t_stmt = (
        select(MitreTechniqueModel)
        .options(
            selectinload(MitreTechniqueModel.tactics).selectinload(MitreTechniqueTacticModel.tactic)
        )
        .where(MitreTechniqueModel.technique_id == cleaned_tid)
    )
    t_res = await db.execute(t_stmt)
    t_obj = t_res.scalars().first()
    tactics = []
    tech_name = None
    if t_obj:
        tech_name = t_obj.name
        tactics = [
            MitreTacticSummary(
                tactic_id=tt.tactic.tactic_id,
                name=tt.tactic.name,
                order_index=tt.tactic.order_index
            )
            for tt in t_obj.tactics if tt.tactic
        ]
        tactics.sort(key=lambda x: x.order_index)

    return MitreMapping(
        id=new_mapping.id,
        technique_id=new_mapping.technique_id,
        technique_name=tech_name,
        tactics=tactics,
        target_type=new_mapping.target_type,
        target_id=new_mapping.target_id,
        mapping_source=new_mapping.mapping_source,
        confidence=new_mapping.confidence,
        evidence_reference=new_mapping.evidence_reference,
        notes=new_mapping.notes,
        created_by=new_mapping.created_by,
        created_at=new_mapping.created_at,
        updated_at=new_mapping.updated_at,
        is_inherited=False
    )


@router.delete("/mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mapping(mapping_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a MITRE technique mapping."""
    stmt = select(MitreMappingModel).where(MitreMappingModel.id == mapping_id)
    res = await db.execute(stmt)
    mapping = res.scalars().first()
    if not mapping:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mapping not found")

    target_type = mapping.target_type
    target_id = mapping.target_id
    technique_id = mapping.technique_id

    await db.delete(mapping)
    await db.commit()

    try:
        from backend.app.engine.event_bus import event_bus
        payload = {
            "id": mapping_id,
            "technique_id": technique_id,
            "target_type": target_type,
            "target_id": target_id
        }
        await event_bus.publish("mitre_mapping_deleted", payload)
        if target_type == MitreTargetType.INVESTIGATION.value and target_id.isdigit():
            await event_bus.publish("investigation_mitre_mapping_removed", {
                "investigation_id": int(target_id),
                "mapping_id": mapping_id,
                "technique_id": technique_id
            })
    except Exception:
        pass

    return None


@router.post("/seed", status_code=status.HTTP_200_OK)
async def trigger_catalog_seed(db: AsyncSession = Depends(get_db)):
    """Admin endpoint to seed or refresh the Enterprise MITRE ATT&CK catalog idempotently."""
    res = await seed_mitre_catalog(db)
    return {"status": "success", "summary": res}
