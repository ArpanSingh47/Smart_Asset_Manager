"""empty

Revision ID: 001_init
Revises: 
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa

revision = '001_init'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    pass  # Tables created via Base.metadata.create_all in main.py

def downgrade():
    pass
