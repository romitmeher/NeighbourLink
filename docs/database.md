# Database guide

Initial migration: backend/migrations/versions/0001_initial.py. It creates 26 application tables; Alembic adds its version table.

| Domain | Tables |
| --- | --- |
| Accounts | users, sessions, account_actions |
| Files | uploads |
| Rentals | rental_listings, rental_blackouts, rental_activity |
| Agreements | bookings, agreements, acceptances |
| Services | provider_profiles, task_requests, provider_offers, service_delivery |
| Finance | payment_orders, payment_attempts, payment_refunds, payment_ledger, payment_event_receipts |
| Community | messages, notifications, reviews, reports, case_events |
| Admin | moderation_audit, category_settings |

## Relationships and conventions

A booking references customer/provider and its resource. An agreement belongs to a booking; acceptances identify each party. A service request receives offers and records the selected booking. Inspection follow-ups are linked but separately approved.

Each booking has at most one payment order; attempts, refunds, and ledger entries reference it. Reports reference bookings, with case events preserving responses and actions. Messages identify booking/request-provider threads with API-enforced access.

Money is integer INR paise; commission is basis points. Some columns store naive UTC values; preserve consistent conversion. Accepted terms and financial records should not be deleted to erase history.

## Operations

Load the environment before Alembic commands; see [setup](setup.md). Upgrade installs schema, check detects drift, and isolated migration tests exercise downgrade/re-upgrade. Do not use shared-database downgrade/reset as a test.

The user explicitly authorized replacing the former four legacy tables. Subsequent catalogue verification reported nine users, eight items, six providers, three requests, and two offers. These are historical counts, not immutable expectations.

The standard reset only targets neighbourlink_dev, not Aiven defaultdb. PostgreSQL race tests use uniquely named temporary schemas and remove only those schemas.

Back up PostgreSQL and persistent upload files together. Keep backups private because account and booking records are sensitive.
