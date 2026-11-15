# Setup and operations

Use PowerShell from the project root. Prerequisites: Python 3.12, Node.js/npm, and accessible PostgreSQL.

## Existing installation

```powershell
.\start.ps1
.\stop.ps1
```

Run start to launch API on 8000, frontend on 5173, and worker; run stop when finished. Logs/PIDs are under var/logs. The API/worker launchers load root .env. Vite proxies /api to the backend.

The launcher prefers .venv/Scripts/python.exe. On this workspace it can fall back to ../work/verified-deps, which is not a portable installation. It skips occupied web/API ports; that does not prove an unrelated process on those ports is NeighbourLink.

## Fresh dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements.txt
npm.cmd ci --prefix frontend
npm.cmd ci --prefix desktop
```

On a new installation, `python deploy/init_env.py` creates .env and refuses to overwrite an existing file.

## Environment

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | PostgreSQL SQLAlchemy URL using postgresql+psycopg |
| SESSION_SECRET | At least 32 bytes for token hashing |
| APP_ENV | Gates current development features |
| ALLOWED_ORIGINS | Comma-separated browser origins |
| COOKIE_SECURE | false for local HTTP; true for HTTPS |
| UPLOAD_DIR | Persistent file location |
| COMMISSION_BPS | 1000 means 10% |
| RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET | Provider test API credentials |
| RAZORPAY_WEBHOOK_SECRET | Independent webhook signing secret |
| NEIGHBOURLINK_URL | Desktop frontend address |
| TEST_POSTGRES_URL | Temporary-schema concurrency-test database |

Never copy secrets into frontend code, documentation, or submission archives.

## Aiven and migrations

Current local settings use Aiven, sslmode=verify-full, and the absolute local path to ca.pem. Update that certificate path when moving machines.

Ordinary Alembic/Python startup does not automatically load .env. Apply migrations through the existing loader:

```powershell
.\.venv\Scripts\python -c "from deploy.inspect_database import load_environment; load_environment(); from alembic.config import Config; from alembic import command; command.upgrade(Config('backend/alembic.ini'), 'head')"
.\.venv\Scripts\python -m deploy.inspect_database
```

Inspect is read-only. Migration changes the database. Back up before maintenance; never rerun replace_confirmed_dataset as routine startup.

## Docker alternative

Compose uses its own PostgreSQL service and does not use the Aiven DATABASE_URL override. This is a separate dataset, served on port 8080.

```powershell
docker compose up --build -d
docker compose ps
```

Docker's Linux engine must be running. Container execution is unverified here. A Windows certificate path cannot work inside Linux without explicit mounting/configuration.

## Admin and seed

Existing credentials are in private .demo-credentials.txt. With environment variables loaded, `python -m backend.manage create-admin --email admin@example.test --name Administrator` prompts for a password.

backend.demo seed/reset requires APP_ENV=development and a PostgreSQL database named neighbourlink_dev. It does not operate on Aiven defaultdb. deploy.enrich_demo assumes the existing seeded accounts and credential file; it is not a generic initializer.

## Desktop

```powershell
npm.cmd start --prefix desktop
npm.cmd run package:win --prefix desktop
```

Default: http://127.0.0.1:5173/. For Docker set NEIGHBOURLINK_URL to http://127.0.0.1:8080/ before launch. Other devices need a reachable shared HTTPS site, not their own loopback address.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Site unavailable | Logs and ports 8000/5173 |
| Readiness fails | Network, URL, CA path, migration |
| Session rejected | Cookie, account state, unchanged SESSION_SECRET |
| Booking expires | Hold deadline and lifecycle worker |
| Demo refund remains queued | Start the worker, check its logs, and ensure APP_ENV=development; see payments.md |
| OTP appears without SMS | Development simulation, not phone verification |
| Docker connection fails | Linux engine; Windows startup is separate |
