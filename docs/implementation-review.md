# Implementation review — 15 November 2026

## Verdict

The planned feature areas have implementations, but the application is not fully complete. Passing tests do not cover every rule or interaction. This review changed no application code and did not reset application data.

## Confirmed findings

1. **High: Dispute resolution stops at the report.** backend/community.py:275 supports report response/note/status changes; resolving a case updates reports only. No resolution operation chooses a booking outcome or queues an adjudicated refund. An isolated reproduction resolved a report and observed its booking still `disputed`. Such service bookings continue blocking the provider's schedule in services.can_fulfil. Add explicit, audited resolution outcomes and any appropriate refund operation, with participant notifications and tests.

2. **Medium: Custom tasks bypass provider eligibility.** backend/services.py:237 skips the provider lookup for `Custom request`; frontend/src/Services.tsx:528 also marks every account eligible for that category. An isolated reproduction removed a user's provider profile and successfully submitted their quote. This bypasses the adult declaration and provider profile requirements. Always validate an active provider profile, while allowing custom tasks to skip only category matching. new_request also skips target-provider lookup for custom tasks.

3. **Medium: Phone OTP account identity is ambiguous.** backend/core.py:30 allows duplicate phone numbers. Registration and profile edits do not reject duplicates, while backend/auth.py:154 selects the first matching account for an OTP request. Two users sharing a number cannot reliably select their account. Decide a unique-phone policy for nonempty numbers or require another account identifier, and test duplicate registration/profile changes and OTP selection. This is a development simulation, as intended; real SMS is outside current scope.

## Feature coverage reviewed

Accounts/sessions/profile/password/development OTP; rental listings/search/blackouts/reservations/handovers/cancellation; immutable agreements/acceptances/PDFs; provider profiles/public and direct tasks/quotes/fixed-hourly-inspection fulfilment/follow-up work; demo capture/refunds/ledger/receipts; messaging/notifications/reviews/report history/admin restrictions/categories/dashboards; lifecycle worker; local startup and Electron wrapper.

No TODO, NotImplemented or empty pass stubs were found in the scoped application Python/TSX/CJS source scan. This does not establish correct behavior in every branch.

## Verification

- Full backend suite via `python -m deploy.run_checks`: **38 passed**, no skips, including two PostgreSQL concurrency tests in temporary isolated schemas. One dependency deprecation warning.
- Desktop policy via `node --test desktop/policy.test.cjs`: **3 passed**.
- Frontend lint and production build passed during the preceding demo-payment fix; not rerun for this read-only review.
- Two additional isolated SQLite probes reproduced the provider-profile bypass and unresolved booking state described above.
- No browser used, per user instruction. Rendered interaction, receipt visual layout, installer interaction, Docker startup, and separate-device shared deployment remain unverified.

Demo payments are the selected requirement. Actual external payment processing is not an acceptance requirement.
