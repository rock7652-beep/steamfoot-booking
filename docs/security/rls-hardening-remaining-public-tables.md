# Remaining public-table RLS hardening

## Scope

Supabase's security advisor reported four remaining tables in Staging with row
level security disabled:

- `GoogleReviewInvite`
- `StoreLineNotificationRecipient`
- `MessengerAuditRun`
- `_prisma_migrations`

This is a separate security change and does not alter the native health feature.

## Verified access model

- All four hosted Staging tables are owned by `postgres`.
- `anon` and `authenticated` have no `SELECT` or `INSERT` privilege on any of the
  four tables.
- `StoreLineNotificationRecipient` and `MessengerAuditRun` are accessed through
  server-side Prisma code. No browser Supabase table access exists for them.
- `_prisma_migrations` is Prisma's internal deployment ledger.
- Existing server-side Prisma flows already operate successfully against other
  application tables protected by the same owner-bypass, no-policy RLS model.

`GoogleReviewInvite` exists in the hosted database but is not represented in the
current Prisma schema. The migration therefore uses `IF EXISTS`: it protects the
hosted table without introducing or guessing an application data model.

## Policy decision

The migration enables RLS without `FORCE ROW LEVEL SECURITY` and adds no public
policies. This closes Data API row access by default while allowing the table
owner used by server-side Prisma and Prisma migrate to continue operating.

Do not add permissive `USING (true)` or `WITH CHECK (true)` policies as a
workaround. Any future browser Data API access must receive a separately reviewed,
least-privilege policy.

## Staging verification

Applied to Supabase Staging on 2026-08-24 as
`20260824110351_harden_remaining_public_tables`.

- All four hosted tables now have `relrowsecurity = true` and
  `relforcerowsecurity = false`.
- All four tables have zero policies and no `anon` or `authenticated` DML
  privileges.
- The `postgres` login role owns all four tables and has `BYPASSRLS`, preserving
  the server-side Prisma and Prisma migrate access model.
- The four original `rls_disabled_in_public` findings no longer appear. The
  advisor now reports only the expected INFO-level `rls_enabled_no_policy`
  notices used throughout this server-only database architecture.
- The focused contract suite passes and the Prisma schema validates.

The repository migration is idempotent. Prisma will record it in
`_prisma_migrations` when this branch is deployed through the normal migration
pipeline; Staging's immediate security application is separately recorded in
Supabase migration history.

Production deployment requires a separate production-role preflight and explicit
production approval.
