"""Record acceptance for new accounts."""
from alembic import op
import sqlalchemy as sa

revision = "0002_policy_acceptance"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("users", sa.Column("policy_required", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("policy_version", sa.String(40), nullable=True))
    op.add_column("users", sa.Column("policy_accepted_at", sa.DateTime(timezone=True), nullable=True))

def downgrade():
    op.drop_column("users", "policy_accepted_at")
    op.drop_column("users", "policy_version")
    op.drop_column("users", "policy_required")
