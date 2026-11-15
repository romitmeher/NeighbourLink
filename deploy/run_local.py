"""Run the local API using the project's private environment settings."""
import os
import uvicorn
from deploy.inspect_database import load_environment

if __name__ == '__main__':
    load_environment()
    origins = os.environ.get('ALLOWED_ORIGINS', '').split(',')
    origins.extend(['http://localhost:5173', 'http://127.0.0.1:5173'])
    os.environ['ALLOWED_ORIGINS'] = ','.join(dict.fromkeys(filter(None, origins)))
    uvicorn.run('backend.main:app', host='127.0.0.1', port=8000)
