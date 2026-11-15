"""One-time, explicitly confirmed replacement of the four legacy tables."""
import os
import secrets
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from deploy.inspect_database import load_environment, ROOT


def main():
    load_environment()
    from backend.core import engine, metadata
    from backend.demo import seed

    expected = {
        'medicine_vector_embeddings', 'medicine_image_vector_embeddings',
        'smartpharm_stocking_reference', 'smartpharm_stocking_feedback',
    }
    if engine.url.database != 'defaultdb' or engine.url.host != 'pg-d4845a8-romitmeher2-24a7.l.aivencloud.com':
        raise SystemExit('Target differs from the explicitly confirmed database.')
    password = secrets.token_urlsafe(20)
    credentials = ROOT / '.demo-credentials.txt'
    # Persist credentials before any database mutation, without printing them.
    with credentials.open('x', encoding='utf-8') as target:
        target.write('NeighbourLink demo accounts\nPassword for all five: ' + password + '\n')
        target.write('\n'.join(role + '@example.test' for role in
                    ('customer', 'owner', 'helper', 'professional', 'admin')) + '\n')
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("SET LOCAL lock_timeout = '15s'")
            conn.exec_driver_sql("SET LOCAL statement_timeout = '120s'")
            existing = set(inspect(conn).get_table_names(schema='public'))
            if existing != expected:
                raise RuntimeError('Public tables changed since confirmation; no changes applied.')
            quote = conn.dialect.identifier_preparer.quote
            names = ', '.join('public.' + quote(name) for name in sorted(expected))
            conn.exec_driver_sql('DROP TABLE ' + names + ' RESTRICT')
            config = Config(str(ROOT / 'backend/alembic.ini'))
            config.attributes['connection'] = conn
            command.upgrade(config, 'head')
            seed(password, connection=conn)
            actual = set(inspect(conn).get_table_names(schema='public'))
            assert actual == set(metadata.tables) | {'alembic_version'}
            assert conn.scalar(text('SELECT count(*) FROM users')) == 5
        print('Committed: four legacy tables removed; NeighbourLink migrated and seeded.')
        print('Demo credentials saved privately to .demo-credentials.txt.')
    except Exception:
        credentials.unlink(missing_ok=True)
        print('Replacement failed; database transaction rolled back.')
        raise
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
