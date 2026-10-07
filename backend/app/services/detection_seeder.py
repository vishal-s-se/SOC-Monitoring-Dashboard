import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.models.detection import DetectionRule
from backend.app.services.detection_catalog import DETECTION_CATALOG

logger = logging.getLogger(__name__)


async def seed_detection_catalog(db: AsyncSession) -> dict[str, int]:
    created = 0
    updated = 0
    catalog_ids = {entry["rule_id"] for entry in DETECTION_CATALOG}
    result = await db.execute(select(DetectionRule).where(DetectionRule.rule_id.in_(catalog_ids)))
    existing_rules = {rule.rule_id: rule for rule in result.scalars().all()}

    for entry in DETECTION_CATALOG:
        rule = existing_rules.get(entry["rule_id"])
        if rule is None:
            db.add(DetectionRule(**entry, version=1))
            created += 1
            continue

        changed = False
        for field in ("name", "description", "severity", "conditions", "tags"):
            value = entry[field]
            if getattr(rule, field) != value:
                setattr(rule, field, value)
                changed = True
        if changed:
            rule.version = (rule.version or 1) + 1
            updated += 1

    await db.commit()
    logger.info("Detection catalog synchronized: %s created, %s updated", created, updated)
    return {"created": created, "updated": updated, "total": len(DETECTION_CATALOG)}
