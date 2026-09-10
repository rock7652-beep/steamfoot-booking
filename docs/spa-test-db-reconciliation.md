# SPA test database reconciliation

This document records the 2026-09-10 reconciliation for the SPA test database.
It is deliberately not a Prisma migration: the database migration ledger has a
historical branch divergence and must not be edited or reset.

## Ledger comparison

The last common migration is `20260801090000_add_transaction_payment_splits`.
The database also records `20260828141500_add_spa_treatments_skills_availability`,
from commit `b72c7cf5`, while this branch does not retain that migration file.

The six local migrations which remain unapplied are:

| Migration | Scope | Required for this SPA reconciliation |
| --- | --- | --- |
| `20260802090000_add_digital_butler_human_support_summary` | `DigitalButlerLead` fields and index | No |
| `20260808090000_enable_transaction_payment_split_rls` | legacy `TransactionPaymentSplit` RLS | No |
| `20260808100000_add_trial_booking_chat_self_service` | legacy booking self-service objects | No |
| `20260810120000_messenger_utility_reminder_idempotency` | `MessageLog` idempotency indexes | No |
| `20260910090000_add_store_module_governance` | `IndustryModule`, `Store.industryModule`, `StoreModuleInstallation` | Yes; only the missing additive installation structure is reconciled |
| `20260911090000_add_isolated_spa_schedule_core` | `SpaBooking`, items, catalogue, skills, availability | Yes conceptually; its required `Spa*` tables already exist in this test database |

The historical `20260828141500` also changed legacy `Booking` and legacy
treatment-support tables. This reconciliation neither replays nor changes that
historical work. New SPA code uses only the independent `Spa*` tables.

## Applied test-only reconciliation

`prisma/reconciliation/20260910_test_spa_governance_reconciliation.sql` was
executed against the test project after confirming its non-sensitive project ref.
It:

1. creates only missing governance enum/table/index objects;
2. creates one installation record for each pre-existing store, preserving all
   store, account, legacy, and existing SPA records;
3. keeps pre-existing SPA stores in `PROVISIONING` until the idempotent
   provisioner completes and explicitly makes them `ACTIVE`;
4. asserts that required `Spa*` tables exist and have no foreign key to legacy
   `Booking`, `Transaction`, or `Treatment`.

It does not change `_prisma_migrations`, reset data, delete data, or mark an
unexecuted migration complete.

## Verification

Run the ref-guarded, read-only verifier with the local test credentials:

```bash
set -a; . ./.env.spa-preview; set +a
npx tsx scripts/verify-spa-test-reconciliation.ts
```

The verifier refuses any direct connection other than the expected test project
and reports only aggregate counts and forbidden legacy foreign keys.

## Remaining gate

At the time of reconciliation, the local `DIRECT_URL` successfully reaches the
test database for migration and verification, but the application
`DATABASE_URL` fails at runtime with Supabase's `tenant/user ... not found`
error. Preview runtime DB confirmation and all write/browser acceptance tests
are therefore blocked until `DATABASE_URL` is corrected for the test project
and independently verified in Vercel Preview.
