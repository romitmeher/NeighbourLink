# NeighbourLink

A college marketplace for nearby item rentals and Local Help. React/TypeScript, FastAPI, PostgreSQL, and a thin Electron Windows client share one application.

**Current status:** the user-selected demo payment flow supports local checkout, partial/full refunds, ledger records, and labelled receipts. See [payment status](docs/payments.md) and [remaining verification](docs/progress.md). A running server or passing build does not establish that the project is complete.

## Start on this Windows installation

From the project root:

```powershell
.\start.ps1
```

- App: http://127.0.0.1:5173
- API reference: http://127.0.0.1:8000/docs
- Database readiness: http://127.0.0.1:8000/api/ready

Stop with `.\stop.ps1`. The API and worker load the private root `.env`; process logs are under `var/logs`. Demo account details are in the Git-ignored `.demo-credentials.txt`.

## Documentation

Start with the [documentation index](docs/README.md).

- [Project plan](docs/project-plan.md)
- [Setup and operations](docs/setup.md)
- [Architecture decisions](docs/decisions.md)
- [Database guide](docs/database.md)
- [API guide](docs/api.md)
- [Payment integration status](docs/payments.md)
- [Progress and remaining work](docs/progress.md)
- [Test evidence](docs/test-results.md)
- [Acceptance checklist](docs/acceptance-checklist.md)
- [Demo walkthrough](docs/demo-script.md)
- [GCP deployment and CI/CD](docs/gcp-deployment.md)

## Windows installer

Artifact: `desktop/dist/NeighbourLink Setup 1.0.0.exe`.

The desktop default is **http://127.0.0.1:5173/**. It requires the shared site to be running; it does not install the API or database. Set `NEIGHBOURLINK_URL` before launch to use another HTTPS or loopback site. The installer is unsigned. Packaging succeeded earlier; interactive installation/launch remains unverified.

Do not include `.env`, demo passwords, private uploads, or dependency caches in a submission archive.
