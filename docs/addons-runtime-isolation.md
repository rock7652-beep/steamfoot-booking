# Shared add-ons runtime isolation

Local implementation, 2026-11-02. Not deployed or verified against production.

## Connection boundary

`addonsPrisma` and `addonsCoursePrisma` lazily construct separate clients for the existing main and course generated schemas. Both require server-only `ADDONS_DATABASE_URL`, `ADDONS_DATABASE_ROLE`, and `ADDONS_DATABASE_PROJECT_REF`. There is no fallback to `DATABASE_URL` or the Beauty client. Their first operation checks the effective database role, login capability, elevated role flags and elevated inheritance; configuration is checked again before cached access. Changed credentials require process restart. Errors from the role probe are masked.

The role name must begin `steamfoot_addons_`; the URL must point to the declared Supabase project, and production is pinned to `qijlnhtpbintanzpxkvf`. Both pools have connection_limit=1, pool_timeout=10 and connect_timeout=10; pooled URLs force pgbouncer=true. This is one connection per generated client instance, not a global database connection cap. Existing main/Beauty clients and their environment variables are unchanged.

The factory retains the existing release isolation, explicit relation join, music archive/schema and audit transaction wrappers. Disabled modules do not construct these clients merely by importing them.

## Affected flows

- Shared add-on management/order/receipt actions, shared catalog reads and image API use the dedicated main-schema client.
- Beauty shared goods use this central catalog/image connection; the Beauty domain connection remains unchanged.
- Customer catalog metadata uses the dedicated client after store resolution.
- Steamfoot ordinary/trial booking selects the dedicated client only when submitted goods selections are nonempty. The whole booking transaction, including goods, stays on one client.
- Course group booking and sports public trial pass an explicit shared-goods option into `courseTransaction`; work, store locks and audit callbacks all use the same course transaction. All other callers keep the existing default client.
- Existing authorization and module/entitlement checks remain authoritative. Role checks are not tenant isolation.

## Database prerequisites

A restricted role, appropriate existing-table privileges, RLS policies and function/trigger compatibility must be reviewed and tested before activation. No GRANT, role creation, production environment edit or migration is included in this implementation.

The permission boundary includes the existing booking transaction when goods are selected. It is broader than the five add-on tables: booking participants, submission/idempotency records, course card/point entries, trial links and operation audit paths may be involved. `SELECT FOR UPDATE` needs appropriate UPDATE column privileges as well as SELECT. Do not infer a complete grant list solely from Prisma model names, and do not grant blanket table updates to satisfy row locks.

The shared QA role has existing limited UPDATE column grants for Store, Booking, BookingParticipant, CashDrawerSession, CoursePointCard and CourseSession. A read-only review found no TrialBookingLink grants on this role; the selected sports public-trial path updates that table's consumedAt. These findings are a starting point for QA privilege review, not evidence of full readiness and not permission to modify grants.

## Verification and limits

Local tests cover rejection of absent/foreign/privileged URL configuration, effective-role failure, lazy initialization, pool bounds, transaction routing, authorization regressions and failure propagation. A PGlite PostgreSQL-engine fixture runs the actual receipt/idempotency services as a restricted role: audit INSERT denial rolls the receipt, cashbook, revision and command back; after the explicit fixture grant, retry commits exactly once. This uses a small SQL adapter, not a deployed Prisma/Supavisor connection or the full production schema.

Runtime role/grant/trigger compatibility, the complete customer booking on the restricted role, and real deployment behavior still require isolated QA. Existing previews do not contain this implementation. Previously passed UI/plan tests need not be repeated unless affected by the connection change. Real iPhone/Safari image gestures retain their previous unverified status.
