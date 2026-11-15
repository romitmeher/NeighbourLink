"""Verify the configured demo database through API login and persisted counts."""
from sqlalchemy import inspect, text
from fastapi.testclient import TestClient
from deploy.inspect_database import load_environment, ROOT


def main():
    load_environment()
    from backend.core import engine, metadata
    from backend.main import app
    password = (ROOT / '.demo-credentials.txt').read_text().splitlines()[1].split(': ', 1)[1]
    with engine.connect() as conn:
        assert set(inspect(conn).get_table_names(schema='public')) == set(metadata.tables) | {'alembic_version'}
        for table, expected in [('users', 5), ('rental_listings', 2),
                                ('provider_profiles', 2), ('task_requests', 1), ('provider_offers', 2)]:
            # Identifiers are fixed application table names.
            count = conn.scalar(text(f'SELECT count(*) FROM {table}'))
            assert count >= expected, (table, count, expected)
            print(f'{table}: {count}')
    for role in ('customer', 'owner', 'helper', 'professional', 'admin'):
        with TestClient(app) as client:
            assert client.get('/api/ready').status_code == 200
            response = client.post('/api/auth/login', json={
                'email': role + '@example.test', 'password': password})
            assert response.status_code == 200, (role, response.status_code)
            me = client.get('/api/auth/me')
            assert me.status_code == 200
            assert me.json()['email'] == role + '@example.test'
            assert bool(me.json()['is_admin']) == (role == 'admin')
            assert client.post('/api/auth/logout').status_code in (200, 204)
            assert client.get('/api/auth/me').status_code == 401
            print(f'{role}: sign-in, session, role and sign-out passed')
    engine.dispose()


if __name__ == '__main__':
    main()
