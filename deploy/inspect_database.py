"""Read connection settings privately and inspect the configured database."""
import os
from pathlib import Path
from sqlalchemy import create_engine, inspect, text

ROOT = Path(__file__).resolve().parents[1]

def load_environment():
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            os.environ[key] = value

def main():
    load_environment()
    engine = create_engine(os.environ['DATABASE_URL'], connect_args={'connect_timeout': 15})
    try:
        with engine.connect() as conn:
            print('Connected database:', conn.scalar(text('SELECT current_database()')))
            print('TLS:', conn.execute(text('SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()')).one())
            inspector = inspect(conn)
            for schema in inspector.get_schema_names():
                if schema == 'information_schema' or schema.startswith('pg_'):
                    continue
                print('Schema:', schema)
                for table in inspector.get_table_names(schema=schema):
                    quote = conn.dialect.identifier_preparer.quote
                    count = conn.scalar(text(f'SELECT count(*) FROM {quote(schema)}.{quote(table)}'))
                    print(f'  {table}: {count} rows')
    except Exception as error:
        print('Connection failed:', type(error).__name__)
        if getattr(error, 'orig', None):
            print(str(error.orig))
        raise SystemExit(1)
    finally:
        engine.dispose()

if __name__ == '__main__':
    main()
