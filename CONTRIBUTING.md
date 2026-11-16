# Contributing to NeighbourLink

Thank you for helping improve NeighbourLink. Please read the
[Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Before you start

- Search existing issues and pull requests before opening a new one.
- For security problems, do not open a public issue. Contact the maintainers
  privately.
- Keep credentials, `.env` files, demo passwords, certificates, uploads, and
  dependency caches out of commits.

## Local setup

Use Windows PowerShell from the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements.txt
npm.cmd ci --prefix frontend
npm.cmd ci --prefix desktop
```

Create a local `.env` with `python deploy/init_env.py`, then configure a
development PostgreSQL database. See [setup documentation](docs/setup.md) for
database, migrations, and startup details.

## Checks before opening a pull request

Run the backend tests and frontend checks:

```powershell
.\.venv\Scripts\python -m pytest backend/tests -q
npm.cmd run lint --prefix frontend
npm.cmd run build --prefix frontend
```

If your change affects migrations, payments, authentication, deployment, or
demo data, add or update focused tests and documentation.

## Pull requests

Please:

- Explain the user-visible or operational change.
- Keep each pull request focused and make surgical changes.
- Include tests and validation results.
- Update directly related documentation.
- Call out configuration, migration, or deployment steps.
- Do not include real payment credentials or production secrets.

Maintainers may request changes before merging. Be respectful and constructive
in reviews and discussions.
