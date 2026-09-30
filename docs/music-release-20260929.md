# Music / shared courses production release

Scope: PR #1134, entire preview branch, explicitly authorized by owner.

## Gates

- Full local Vitest: 709 files passed, 11 skipped; 6085 tests passed, 75 skipped.
- TypeScript and changed-file ESLint passed. PostgreSQL tests requiring an explicit
  disposable local database are skipped, not represented as passing.
- Repair only stale test fixtures/mocks and relocated status-label assertions;
  preserve permission coverage and add denied finance-write regression.
- Latest preview and required CI checks must pass before schema release / merge.

## Database release

Run `node scripts/music-release-20260929.mjs` to produce reviewed SQL, not execute it.
Only the explicitly named seven existing migrations are included; SHA-256 guards
reject changed source and matching Supabase counterparts are checked.
Apply with the Supabase migration tool to production project
`qijlnhtpbintanzpxkvf`, using name `music_shared_release_20260929`.
No blanket Prisma deploy, no change to existing production migration allowlists.

Single repeatable-read transaction, 5s lock timeout, 60s statement timeout.
Reject partial/replayed release or unresolved migrations. Preserve hashes of legacy
Store/Staff/Customer/Booking/SpaBooking/Transaction and course financial snapshots
and payments. Verify four RLS tables and security-invoker function. Record Prisma
checksums and matching Supabase history in the same transaction as actual SQL.

Preflight production: four new tables absent; no seven release history entries;
zero course purchases/cards/compensation snapshots/fee payments; no duplicate
music subject names. Existing course prerequisite columns and fee index present.
Postflight must recheck schema, history, RLS, row counts before merge.

## Recovery / limitations

On SQL error the entire transaction rolls back. Do not replay a partial release.
After success, retain schema on application rollback; never drop new user data.
Partial payments remove a uniqueness restriction, so after new writes an application
rollback needs explicit compatibility review, not automatic index recreation.
Merge through PR with expected head SHA, then wait for production deployment READY.
Do not promote preview: its database is isolated from production.

Authenticated desktop/iPad end-to-end and two-device concurrent verification remain
incomplete; unit/build results are not a substitute for those checks.
