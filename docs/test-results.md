# Test evidence ledger

## Demo payment fix: 15 November 2026

- `python -m pytest backend/tests -q` with DATABASE_URL=sqlite://: **36 passed, 2 skipped**. Skips are PostgreSQL concurrency checks because TEST_POSTGRES_URL was absent. One dependency deprecation warning was reported.
- `npm.cmd run lint --prefix frontend`: passed.
- `npm.cmd run build --prefix frontend`: passed.

New coverage verifies demo capture/retries, partial/full refunds and rounding, refund limits, permissions, hold/agreement requirements, environment gating, and demo/gateway isolation. Tests forbid gateway calls for demo records with credentials present or absent. No browser was used. Actual provider transactions are outside the selected demo scope.

## Directly observed historic results

| Check | Result | Limitation |
| --- | --- | --- |
| Aiven | Verified TLS 1.3 and successful inspection | Historical, not uptime guarantee |
| Migration | 26 application tables plus Alembic | Later model edits need drift checks |
| Full backend suite | 25 passed, including both PostgreSQL races | Before later OTP/custom/demo edits |
| Focused later checks | 6 passed, 1 skipped | That run lacked PostgreSQL URL; race evidence is separate |
| Frontend lint/build | Passed | Before latest externally changed UI |
| Desktop policy | 3 passed | Policy only |
| NSIS packaging | Installer generated | Interactive install/launch unverified |
| Five-role live HTTP | Discovery, dashboards, permissions, sessions passed | Does not render interface |
| Razorpay authentication | Read-only orders request HTTP 200 | Not capture/refund proof |

## Claims in previous documents

Previous documents reported **29 passed, 2 skipped** while describing PostgreSQL races as included. The two visible skip sites are PostgreSQL tests when TEST_POSTGRES_URL is absent. Separate runs could explain this, but commands/results were not attached to distinguish them.

Signed local/public webhook probes were also reported. Even a successful probe is not provider-originated delivery or proof of financial processing. No current tunnel hostname is certified here.

These reports are not fresh verified results.

## Repeatable commands

After dependency installation:

```powershell
$env:DATABASE_URL='sqlite://'
.\.venv\Scripts\python -m pytest backend/tests -q
npm.cmd run lint --prefix frontend
npm.cmd run build --prefix frontend
node --test desktop/policy.test.cjs
```

The SQLite command normally skips PostgreSQL races without TEST_POSTGRES_URL. To use .env's database with isolated temporary schemas:

```powershell
.\.venv\Scripts\python -m deploy.run_checks
```

For live non-browser API checks:

```powershell
.\.venv\Scripts\python -m deploy.verify_live
```

Live verification signs in/out, changing session records. Record date, command, environment, pass/fail/skip counts, skip reasons, and source version/hash. Separate mocked tests, synthetic probes, and actual provider tests.

Build/API results cannot certify responsive rendering, PDF visual layout, external checkout interaction, or installer behavior.
