# Project plan

## Objective and scope

Deliver a working multi-user marketplace for renting nearby items and booking local services, with shared website and desktop access. This is a consolidated plan from available requirements and local implementation; missing portions of the original chat have not been invented.

One account can be customer, renter, owner, and provider. Admin privileges are separate. Adult eligibility, experience, and qualifications are self-declared unless actually verified.

Support public tasks and provider-specific requests; fixed, hourly, and inspection quotes; rental and service agreements; messaging, reports, administration, and financial records.

Registration and basic listings are free. Initial commission is configurable at 10%, deducted from provider earnings. No additional customer platform fee or security deposit. Money uses integer INR paise; store UTC and display Asia/Kolkata time.

Exclude training, guarantors, insurance, platform guarantees, equipment/helper bundles, GPS tracking, delivery fleets, subscriptions, paid promotion, AI recommendations, property rentals, vehicles, and expensive machinery.

## Implementation and acceptance phases

| Phase | Deliverable | Evidence required |
| --- | --- | --- |
| Foundation | Database, migrations, sessions, profiles, account states, admin bootstrap | Fresh migration, authentication, permissions, persistence |
| Listings | Rental/provider profiles, search, images, editing and publication | Ownership, validation, filters, privacy, persistent uploads |
| Reservations | Requests, blackouts, holds, expiry, immutable prices | Real PostgreSQL competing-acceptance test, expiry and conflict checks |
| Agreements | Version/hash, two-party acceptance, preview and PDF | Same-version enforcement, correct PDF, private access |
| Payments | Development demo checkout, partial/full refunds, ledger, receipts | Local capture/refund tests, duplicate protection, no gateway calls for demo records |
| Rental fulfilment | Pickup, evidence, return, completion, disputes, cancellation | Separate-party lifecycle, invalid transitions, refund behavior |
| Local Help | Directory, direct/public requests, quotes, selected offer, schedule | Both discovery routes, concurrency and schedule conflict tests |
| Service fulfilment | Work start/completion, inspections, hourly caps | Separate inspection/work records, approved hours, unused-time refunds |
| Community | Messages, notifications, reminders, reviews | Persistence, participant access, deduplication, rating eligibility |
| Administration | Reports, evidence, notes, restrictions, financial dashboards | Admin role barriers, audit trail, correct financial totals |
| Delivery | Usable interface, demo data, startup, installer and documentation | Current build/tests, permitted interactive checks, packaging |

These phase labels consolidate available materials rather than reproducing unseen original text.

## Lifecycle rules

Rental: requested → awaiting agreement → awaiting payment → confirmed → active → return proposed → completed. Decline, expiry, cancellation, and dispute are explicit alternatives.

Service: request → quote → awaiting agreement → awaiting payment → confirmed → in progress → completion proposed → completed. The customer confirms or disputes completion.

Pending requests do not reserve inventory. Unexpired accepted holds and confirmed/active bookings do. Rental dates are inclusive start/exclusive return, at least one day. Changes to listings cannot rewrite existing booking prices.

Both parties accept one immutable agreement version/hash. Additional work or charges require separate approval. An inspection never automatically authorizes repairs; follow-up work has a separate linked booking.

Before pickup/work, eligible cancellation requests a full refund and commission reversal. After handover/work, use recorded review/dispute. Allegations do not automatically charge users.

## Payment requirement

The user's latest instruction explicitly selects a demo payment gateway, superseding the earlier provider-test requirement. Checkout and refunds run locally in development, with clear simulation labels and no money moved. Razorpay integration remains a separate optional code path, not a requirement for the demo.

Keep booking value, capture, refunds, commission, earnings, and payouts distinct. Earnings remain unsettled without provider-confirmed payouts. Commission is revenue, not profit; gateway fees/taxes are excluded from the college calculation.

## Completion gate

Inspect, implement, test positive/negative cases, fix failures, rerun affected regressions, and record evidence. Continue independent work when one external dependency is blocked.

Respect the user's no-browser instruction. HTTP checks do not verify rendered interaction. Reconcile the [acceptance checklist](acceptance-checklist.md) before declaring completion.
