"""Run isolated tests; PostgreSQL races use temporary schemas, not public data."""
import os
import pytest
from deploy.inspect_database import load_environment

if __name__ == '__main__':
    load_environment()
    os.environ['TEST_POSTGRES_URL']=os.environ['DATABASE_URL']
    os.environ['DATABASE_URL']='sqlite://'
    raise SystemExit(pytest.main(['backend/tests','-q']))
