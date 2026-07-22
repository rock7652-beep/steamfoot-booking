# PR-4: public schema RLS hardening

## Scope

Production had 24 `public` tables without row-level security. One is Prisma's
internal `_prisma_migrations` ledger. This migration enables RLS on the remaining
23 application tables.

## Access model verified before the change

- `anon` and `authenticated` have no table privileges on any `public` table.
- The browser does not receive a service-role key.
- Application reads and writes use server-side Prisma with the database table
  owner (`postgres`). PostgreSQL table owners bypass RLS unless `FORCE ROW LEVEL
  SECURITY` is enabled.
- Existing RLS-enabled application tables use the same no-policy model in
  Production.

## Policy decision

No `anon` or `authenticated` policies are added. This keeps the Data API closed by
default while preserving server-side Prisma behavior. A future feature that needs
browser Data API access must add explicit least-privilege grants and row policies
in a separate reviewed migration.

`FORCE ROW LEVEL SECURITY` is intentionally not enabled because it would also
apply RLS to the Prisma table-owner connection and could interrupt the application.

## Deployment verification

After `prisma migrate deploy`:

1. Confirm the migration ledger contains
   `20260722090000_enable_rls_on_remaining_application_tables`.
2. Confirm all 23 listed tables have `relrowsecurity = true`.
3. Confirm `anon` and `authenticated` still have no table privileges.
4. Run read-only smoke checks for login, customer list, booking availability,
   payment dashboard, and LINE binding entry.
5. Run Supabase security advisors and confirm there are no remaining application
   tables in `public` without RLS.

## Rollback

If the server-side database role differs from the verified table-owner model,
disable RLS only on the affected tables and investigate the connection role before
retrying. Do not add permissive public policies as an emergency workaround.
