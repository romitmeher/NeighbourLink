"""Exercise the deployment migration against a fresh disposable database."""
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect

from backend.main import app
from backend.core import metadata


def test_initial_migration_roundtrip(tmp_path):
    url = 'sqlite:///' + (tmp_path / 'migration.sqlite').as_posix()
    environment = dict(os.environ, DATABASE_URL=url)
    root = Path(__file__).resolve().parents[2]

    def migrate(*args):
        subprocess.run(
            [sys.executable, '-m', 'alembic', '-c', 'backend/alembic.ini', *args],
            cwd=root, env=environment, check=True, capture_output=True, text=True,
            timeout=30,
        )

    engine = create_engine(url)
    try:
        migrate('upgrade', 'head')
        assert set(inspect(engine).get_table_names()) == set(metadata.tables) | {'alembic_version'}
        migrate('check')
        migrate('downgrade', 'base')
        assert set(inspect(engine).get_table_names()) == {'alembic_version'}
        migrate('upgrade', 'head')
    finally:
        engine.dispose()
