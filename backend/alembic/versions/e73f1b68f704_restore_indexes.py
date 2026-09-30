"""Restore indexes

Revision ID: e73f1b68f704
Revises: 1aebca0ed231
Create Date: 2026-09-30 10:43:58.272755

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e73f1b68f704'
down_revision: Union[str, Sequence[str], None] = '1aebca0ed231'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(op.f('ix_alert_agent_id'), 'alert', ['agent_id'], unique=False)
    op.create_index(op.f('ix_alert_host_id'), 'alert', ['host_id'], unique=False)
    op.create_index(op.f('ix_event_agent_id'), 'event', ['agent_id'], unique=False)
    op.create_index(op.f('ix_event_host_id_timestamp'), 'event', ['host_id', 'timestamp'], unique=False)

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_alert_agent_id'), table_name='alert')
    op.drop_index(op.f('ix_alert_host_id'), table_name='alert')
    op.drop_index(op.f('ix_event_agent_id'), table_name='event')
    op.drop_index(op.f('ix_event_host_id_timestamp'), table_name='event')
