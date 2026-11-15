# Documentation index

Reviewed against local source on 15 November 2026 (India time).

1. [Project plan](project-plan.md): target requirements and completion gates.
2. [Progress](progress.md): current implementation and gaps.
3. [Setup](setup.md): Windows, Aiven, Docker, and troubleshooting.
4. [Architecture](decisions.md), [database](database.md), and [API](api.md).
5. [Payments](payments.md): intended demo checkout and local refunds.
6. [Test evidence](test-results.md) and [acceptance checklist](acceptance-checklist.md).
7. [Demonstration](demo-script.md): manual presentation guide.

## Evidence conventions

- **Implemented:** relevant code exists; not a claim every workflow passed.
- **Verified:** an identified check actually passed at its recorded time.
- **Gap:** implementation differs from target or is unfinished.
- **Unverified:** adequate evidence for current source is missing.
- **Blocked:** an external dependency or user constraint prevents checking.

Historical tests do not automatically certify later edits. A signed webhook probe is not proof of actual payment capture or refund.

The original combined plan retrieved from chat was truncated during phase 9. The plan here consolidates available requirements and local documents; it is not an exact complete transcription.

The latest user instruction selects demo payments. The payment fix and its regression evidence are documented here; no database reset is needed.
