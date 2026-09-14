# PR #1001 Production closeout

Status: preparation only. This document does not authorize a Production write,
migration, merge, LIFF change, or deployment.

## Frozen release scope

PR #1001 is frozen at the already accepted SPA member/staff flow. No additional
screen, booking flow, or unrelated refactor belongs in this release. The test
LIFF remains attached to Preview.

## Production migration inventory

The Production Prisma ledger is missing ten repository migrations. They are not
one homogeneous pending batch and must not be sent to a generic
`prisma migrate deploy`:

| Migration | Production schema finding | Required treatment |
|---|---|---|
| `20260826143000_add_recurring_confirmation_notification` | Four `BookingRecurrenceGroup` columns are absent | Execute the original pinned migration |
| `20260828141500_add_spa_treatments_skills_availability` | Its shared SPA tables are retired; final `Spa*` replacements exist | Resolve only after the final-schema contract passes |
| `20260830093000_add_spa_stored_value_wallet` | Shared wallet tables are retired; isolated wallet tables exist | Resolve only after the final-schema contract passes |
| `20260831140000_add_spa_staff_compensation` | Final compensation table exists | Resolve only after the final-schema contract passes |
| `20260901110000_add_isolated_spa_models` | Final isolated booking, entitlement and payment tables exist | Resolve only after the final-schema contract passes |
| `20260901123000_add_store_industry_module` | `Store.industryModule` and the enum exist | Resolve only after the final-schema contract passes |
| `20260901153000_cutover_spa_operational_models` | Final catalog, schedule, wallet and payment structures exist | Resolve only after the final-schema contract passes |
| `20260901154500_remove_legacy_spa_shared_schema` | Shared tables are absent and module firewalls exist | Resolve only after the final-schema contract passes |
| `20260903120000_backfill_spa_payments` | Production has no SPA tenant or `demo-store`; this backfill is a no-op | Resolve only while that zero-row condition remains true |
| `20260913090000_add_staff_member_link` | Table is absent; prerequisites are compatible | Execute the original pinned migration |

No missing schema is marked applied. No retired transitional SQL is replayed.
Published migration files remain immutable.

## Prepared controls

`scripts/spa-production-migration-readiness.mjs --inspect` is read-only. It
requires both database URLs to identify Production, pins all eight superseded
migration checksums, executes the complete committed SPA column/index
fingerprint inside a read-only transaction, and verifies:

- all final isolated SPA tables exist and retired shared tables do not;
- RLS is enabled and browser roles have no direct table grants;
- `Store.industryModule` is present;
- Production still has zero SPA tenants and no `demo-store` rows to backfill;
- all expected module-firewall triggers exist and the firewall function is not
  executable by browser roles;
- ledger rows are either absent or exactly applied with the repository checksum.

The separately confirmed `--reconcile-superseded` mode uses only
`prisma migrate resolve --applied` for the eight verified superseded entries.
It takes an advisory lock, never executes their SQL, never writes
`_prisma_migrations` directly, and verifies every resulting checksum.

After reconciliation, `scripts/ci-migrate.mjs` accepts the single fixed target
`spa_member_staff_release_20260914`. It rejects all pending sets except the two
real migrations in chronological order, or StaffMemberLink alone after an
already verified notification migration. It pins both checksums, verifies
before/after schema and ledger states, uses timeouts and an advisory lock, and
requires `StaffMemberLink` to remain empty after migration.

## Authorized Production execution order

The following is the future runbook, not authorization to run it now:

1. Freeze writes that can create the first SPA tenant; record the current
   Production deployment and recoverable backup/PITR point.
2. Set `PRODUCTION_MIGRATION_TARGET=spa_member_staff_release_20260914` for one
   controlled Production build. Sensitive Vercel database variables remain
   write-only outside that build.
3. The guarded build first confirms both URLs identify
   `qijlnhtpbintanzpxkvf`, runs the read-only inspection, and only then runs the
   confirmed superseded-history reconciliation. It requires all eight ledger
   entries to be exactly applied before continuing.
4. The same guarded build applies only the two real migrations and aborts
   before application deployment on any mismatch.
5. Verify no Prisma migrations remain pending, the four notification columns
   match, `StaffMemberLink` is empty and server-only, and Steamfoot store/module
   counts are unchanged.
6. Promote the exact reviewed artifact, then smoke-test Steamfoot HQ login,
   member login, one existing booking read/cancel-policy read, plan balance read,
   and cross-store denial. Do not create or mutate customer financial data for
   smoke testing.
7. Remove `PRODUCTION_MIGRATION_TARGET` immediately. Only after the release is
   stable may HQ link real staff members or onboard a separately approved SPA
   tenant and production LIFF.

## Failure handling

- Reconciliation mismatch: stop without resolving anything further; do not
  replay transitional SQL or edit the ledger manually.
- Migration failure: application deployment stays blocked. Inspect Prisma's
  failed row and actual schema before any retry; do not use a blanket resolve.
- Application smoke failure after successful additive migration: roll back the
  application deployment and retain the new columns/table and migration
  history. Do not drop staff links or financial history.
- Any legacy Steamfoot data-count, firewall, RLS, tenant or project-ref change:
  stop the release and perform a fresh read-only inventory.
