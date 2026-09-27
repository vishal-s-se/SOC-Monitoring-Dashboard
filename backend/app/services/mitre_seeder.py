import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.models.mitre import MitreTactic, MitreTechnique, MitreTechniqueTactic

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"

async def seed_mitre_catalog(db: AsyncSession) -> Dict[str, int]:
    """
    Seeds or updates the Enterprise MITRE ATT&CK catalog idempotently from JSON definitions.
    Safe to run repeatedly.
    """
    tactics_file = DATA_DIR / "mitre_tactics.json"
    techniques_file = DATA_DIR / "mitre_techniques.json"

    tactics_count = 0
    techniques_count = 0
    tactic_rel_count = 0

    # 1. Seed Tactics
    if tactics_file.exists():
        with open(tactics_file, "r", encoding="utf-8") as f:
            tactics_data: List[Dict[str, Any]] = json.load(f)

        for tac in tactics_data:
            stmt = select(MitreTactic).where(MitreTactic.tactic_id == tac["tactic_id"])
            res = await db.execute(stmt)
            existing = res.scalars().first()

            if existing:
                existing.name = tac["name"]
                existing.description = tac.get("description")
                existing.order_index = tac.get("order_index", 0)
                existing.external_url = tac.get("external_url")
            else:
                new_tac = MitreTactic(
                    tactic_id=tac["tactic_id"],
                    name=tac["name"],
                    description=tac.get("description"),
                    order_index=tac.get("order_index", 0),
                    external_url=tac.get("external_url")
                )
                db.add(new_tac)
                tactics_count += 1

        await db.flush()

    # 2. Seed Techniques (parents first, then sub-techniques)
    if techniques_file.exists():
        with open(techniques_file, "r", encoding="utf-8") as f:
            techniques_data: List[Dict[str, Any]] = json.load(f)

        # Sort so that non-subtechniques (parents) are processed first
        sorted_techniques = sorted(techniques_data, key=lambda x: 1 if x.get("is_subtechnique") else 0)

        for tech in sorted_techniques:
            stmt = select(MitreTechnique).where(MitreTechnique.technique_id == tech["technique_id"])
            res = await db.execute(stmt)
            existing = res.scalars().first()

            if existing:
                existing.name = tech["name"]
                existing.description = tech.get("description")
                existing.is_subtechnique = tech.get("is_subtechnique", False)
                existing.parent_technique_id = tech.get("parent_technique_id")
                existing.platforms = tech.get("platforms")
                existing.data_sources = tech.get("data_sources")
                existing.is_deprecated = tech.get("is_deprecated", False)
                existing.dataset_version = tech.get("dataset_version")
            else:
                new_tech = MitreTechnique(
                    technique_id=tech["technique_id"],
                    name=tech["name"],
                    description=tech.get("description"),
                    is_subtechnique=tech.get("is_subtechnique", False),
                    parent_technique_id=tech.get("parent_technique_id"),
                    platforms=tech.get("platforms"),
                    data_sources=tech.get("data_sources"),
                    is_deprecated=tech.get("is_deprecated", False),
                    dataset_version=tech.get("dataset_version")
                )
                db.add(new_tech)
                techniques_count += 1

        await db.flush()

        # 3. Associate Tactics
        for tech in sorted_techniques:
            tactic_ids = tech.get("tactics", [])
            for tac_id in tactic_ids:
                stmt = select(MitreTechniqueTactic).where(
                    MitreTechniqueTactic.technique_id == tech["technique_id"],
                    MitreTechniqueTactic.tactic_id == tac_id
                )
                res = await db.execute(stmt)
                existing_rel = res.scalars().first()
                if not existing_rel:
                    rel = MitreTechniqueTactic(
                        technique_id=tech["technique_id"],
                        tactic_id=tac_id
                    )
                    db.add(rel)
                    tactic_rel_count += 1

        await db.flush()

    await db.commit()
    logger.info(f"MITRE ATT&CK Seeded: {tactics_count} new tactics, {techniques_count} new techniques, {tactic_rel_count} tactic relationships")
    return {
        "tactics_seeded": tactics_count,
        "techniques_seeded": techniques_count,
        "relationships_seeded": tactic_rel_count
    }
