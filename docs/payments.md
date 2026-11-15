# Demo payments

The user explicitly selected a demo payment gateway, superseding the earlier provider-test requirement. No real money moves. No Razorpay credentials, public webhook, or tunnel is needed for demo checkout or refunds.

## Checkout

With APP_ENV=development (the local default), the frontend calls POST /api/bookings/{id}/checkout/demo. Only the customer can pay; the booking must be eligible, its hold valid, and both parties must have accepted the agreement.

Orders and captures use demo_order_ and demo_pay_ identifiers. Capture updates the booking and ledger in one transaction. Repeated checkout returns the existing result without another capture. Existing external orders cannot be converted to demo orders.

## Refunds

Existing cancellation and refund policies queue durable refund requests. The worker processes demo requests locally, even without gateway credentials, using stable demo_rfnd_ identifiers. Partial refunds recalculate commission on the retained amount; full refunds reverse remaining commission. Repeated processing cannot add another ledger entry. Refunds exceeding the remaining balance are rejected.

Run the worker through start.ps1. If a refund remains queued, inspect var/logs/worker.err.log and ensure APP_ENV=development. Demo processing stops when development mode is disabled.

## Records and boundaries

Finance reports the stored order's mode. Demo receipts and notifications identify the simulation; receipts explicitly state that no money moved. Amounts use integer INR paise and the booking's commission rate; the initial default is 10%. Earnings remain unsettled and no payout is claimed.

Gateway checkout/webhook/refund code remains separate. Gateway polling and refund dispatch exclude demo orders. Gateway events cannot settle demo records, and demo settlement cannot change external orders. The optional provider callback is POST /api/payments/webhook; it is unnecessary for the selected demo flow.

## Verification

Tests cover capture, retry idempotency, full/partial refunds, rounding, excessive refunds, permissions, expired holds, missing acceptances, environment gating, and gateway isolation. Tests fail on any gateway call for demo-only records, with and without credentials. See [test evidence](test-results.md).
