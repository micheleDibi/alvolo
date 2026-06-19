"""add generic file attachment columns (file_filename, file_mime)

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("item") as batch:
        batch.add_column(sa.Column("file_filename", sa.String(), nullable=True))
        batch.add_column(sa.Column("file_mime", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("item") as batch:
        batch.drop_column("file_mime")
        batch.drop_column("file_filename")
