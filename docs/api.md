# API guide

The running API publishes authoritative request/response models at http://127.0.0.1:8000/docs and /openapi.json. Prefix all routes below with /api.

Authentication uses the nl_session cookie. Use a cookie-preserving client or the same-origin frontend proxy.

| Area | Main routes | Access |
| --- | --- | --- |
| Health | GET /health, /ready | Operational checks |
| Accounts | POST /auth/register, /auth/login, /auth/logout; GET /auth/me | Session-based |
| Profile | PATCH /profile; POST /auth/password | Own account |
| Development OTP | POST /auth/dev-otp/request, /auth/dev-otp/verify | Development simulation |
| Images | POST /uploads; GET /uploads/{id} | Public or permission-checked read |
| Listings | GET/POST /rentals/listings; PATCH /rentals/listings/{id}; GET /rentals/mine | Owner mutations |
| Blackouts | GET/POST /rentals/listings/{id}/blackouts; DELETE .../blackouts/{block_id} | Owner |
| Rental request | POST /rentals/listings/{id}/requests | Customer; no self-rental |
| Rental actions | GET /rentals/bookings/{id}; POST .../actions | Participant lifecycle |
| Bookings | GET /bookings, /bookings/{id} | Own records; admin detail |
| Agreements | GET /bookings/{id}/agreement, /agreement.pdf; POST /agreement/accept | Parties accept; authorized reads |
| Providers | GET /help/providers; PUT /help/profile | Own profile mutations |
| Requests | GET/POST /help/requests; GET .../{id}/photos/{photo_id} | Public/direct visibility |
| Quotes | GET/POST /help/requests/{id}/offers; POST .../{offer_id}/accept | Provider quotes; customer selection |
| Service actions | /help/bookings/{id}/delivery, /start, /propose, /confirm, /cancel, /dispute, /follow-up | Role/lifecycle checks |
| Gateway | POST /bookings/{id}/checkout, /checkout/verify | Customer and agreement checks |
| Demo checkout | POST /bookings/{id}/checkout/demo | Intended development payment path; customer only, accepted agreement and valid hold required |
| Webhooks | POST /payments/webhook | Signature/event validation |
| Finance | GET /bookings/{id}/finance, /receipt | Parties/admin |
| Messages | /community/bookings/{id}/messages; /community/requests/{id}/providers/{pid}/messages | Private participants; authorized admin reads |
| Notifications | GET /community/inbox; POST /community/notifications/{id}/read | Own inbox |
| Reviews | POST /community/bookings/{id}/reviews; GET /community/ratings/{uid} | Completed-booking eligibility |
| Reports | POST /community/bookings/{id}/reports; POST /community/reports/{id}/actions | Participant/admin rules |
| Dashboards | GET /community/dashboard, /community/admin/dashboard | Own/admin |
| Moderation | /admin/users/{id}/state; /community/admin/listings/{id}/restriction; /community/admin/categories | Admin with reason |

Consult OpenAPI for exact method/model details where the table groups routes.

## Responses

401 means missing/rejected authentication; 403 denied role/origin/state; 404 unavailable/private resource; 409 conflict or stale lifecycle/version; 422 validation; 429 rate limit with Retry-After; 502/503 gateway/configuration/service issue.

Logout can return 204 with no JSON body. A simulated checkout response or synthetic signed webhook probe does not establish an actual gateway transaction.
