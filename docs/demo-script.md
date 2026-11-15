# Manual demonstration guide

Use fictional accounts from private .demo-credentials.txt. Do not display passwords in presentation screenshots. Browser automation is prohibited by the user; this guide is not a claim that its interactions were executed.

## Prepare

Start API, web, and worker with start.ps1. Confirm /api/ready. Use separate customer and owner/provider sessions. Choose current dates/times; expired quotes need replacement.

The intended checkout is simulated: no money moves. Keep the worker running to process demo refunds; see [payments](payments.md).

## Walkthrough

1. **Discover:** show Home, Rentals, and Local Help. Search an item, inspect condition/accessories, and request dates. A request alone is not confirmation.
2. **Agree:** owner accepts; show hold deadline. Both parties review/accept the same agreement and download its PDF.
3. **Demo payments:** check out after both parties accept. Show the confirmed booking, ledger and demo receipt. Trigger an eligible cancellation/refund and let the worker process it; refresh finance to inspect the refund and recalculated commission. All amounts are simulated.
4. **Handover:** for a confirmed booking within its dates, both acknowledge pickup. Add private evidence. Renter proposes return; owner confirms receipt or reports a problem.
5. **Services:** demonstrate directory/direct request and a public task, provider quote, customer selection, and scope agreement. Explain hourly caps and separate inspection follow-up work.
6. **Community:** exchange messages; inspect notifications. Reviews require completed bookings. Show report evidence and admin notes, restrictions, audit history, and separate financial totals.

Work start requires the scheduled time and payment state. Do not suggest a five-minute demonstration can automatically bypass future appointments or required acknowledgements.

## Close honestly

Distinguish implemented features, tested behavior, and unverified interactions. Payouts remain unsettled. Docker and packaged-client interaction lack current verification. Actual provider transactions are outside the selected demo scope.
