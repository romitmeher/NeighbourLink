"""Keep uploaded images available across server instances and deployments."""
from alembic import op
import sqlalchemy as sa

revision = "0003_persistent_uploads"
down_revision = "0002_policy_acceptance"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("uploads", sa.Column("content", sa.LargeBinary(), nullable=True))

def downgrade():
    op.drop_column("uploads", "content")
