"""add_host_investigation_indexes

Revision ID: 70c4a06360da
Revises: 0302ab5f8a2b
Create Date: 2026-09-28 11:22:09.416585

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '70c4a06360da'
down_revision: Union[str, Sequence[str], None] = '0302ab5f8a2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index('ix_event_host_id_timestamp', 'event', ['host_id', 'timestamp'], unique=False)
    op.create_index(op.f('ix_event_agent_id'), 'event', ['agent_id'], unique=False)
    op.create_index(op.f('ix_alert_host_id'), 'alert', ['host_id'], unique=False)
    op.create_index(op.f('ix_alert_agent_id'), 'alert', ['agent_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_alert_agent_id'), table_name='alert')
    op.drop_index(op.f('ix_alert_host_id'), table_name='alert')
    op.drop_index(op.f('ix_event_agent_id'), table_name='event')
    op.drop_index('ix_event_host_id_timestamp', table_name='event')
