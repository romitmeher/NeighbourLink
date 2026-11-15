# Completion checklist

Unchecked means current evidence/review is required, not necessarily missing code.

## Accounts and privacy

- [ ] Registration, duplicate rejection, login/logout, password changes pass.
- [ ] Admin assignment and restricted/suspended rules are enforced.
- [ ] Private bookings, files, messages, agreements, and finances reject unrelated users.
- [ ] Development OTP is clearly simulated and environment-gated.
- [ ] Sessions/uploads behave correctly across restart.

## Rentals

- [ ] Ownership, publication, images, search, and filters pass.
- [ ] Blackout creation/removal enforces ownership and availability.
- [ ] Self-rental, invalid dates, concurrency, and expiry are tested.
- [ ] Price snapshots and agreement version/hash remain immutable.
- [ ] PDFs contain correct terms and private access controls.
- [ ] Two-party pickup, return, cancellation, and disputes behave correctly.

## Services

- [ ] Provider discovery and public/direct task routes work.
- [ ] Quotes enforce roles, expiry, one selected offer, and schedule conflicts.
- [ ] Fixed, hourly, and inspection flows retain distinct records.
- [ ] Work starts only after required payment/agreement.
- [ ] Customer completion, hourly caps, disputes, and refunds are verified.

## Community/admin

- [ ] Messages, unread counts, reminders, and notifications persist/deduplicate.
- [ ] Completed-booking-only reviews and separate summaries are correct.
- [ ] Reports preserve evidence, responses, internal notes, and status history.
- [ ] Restrictions/finances enforce admin barriers and audit records.

## Demo payments

- [x] Frontend uses the agreed demo endpoint (source reviewed; build passed).
- [x] Demo capture and repeated checkout are regression-tested.
- [x] Permissions, holds, agreement acceptance and environment gates are tested.
- [x] Local full/partial refunds, duplicates, limits and commission rounding are tested.
- [x] Demo records cannot be settled by gateway events or dispatched to gateway refund APIs.
- [x] Receipt generation and finance totals are tested; demo labels are present in source.
- [ ] Receipt visual layout and full interactive demo are manually verified.

## Delivery

- [ ] Fresh installation, migration, and documented startup work.
- [ ] Current-source regression, PostgreSQL races, lint/build pass.
- [ ] Interface checks occur only through user-authorized methods.
- [ ] Installer launches and connects to the intended shared site.
- [ ] Separate devices can use the shared deployment.
- [ ] Submission excludes secrets, private uploads, and caches.
- [ ] Documentation/evidence matches the final implementation.
