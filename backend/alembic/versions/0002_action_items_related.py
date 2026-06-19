"""add action_items and related_item_ids to item

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("item") as batch:
        batch.add_column(sa.Column("action_items", sa.Text(), nullable=True))
        batch.add_column(sa.Column("related_item_ids", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("item") as batch:
        batch.drop_column("related_item_ids")
        batch.drop_column("action_items")
