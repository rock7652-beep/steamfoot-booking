# Production migration reconciliation

This repository contains two deliberately separate, non-build tools for the
Messenger migration-history incident and the later payment-split migration.
Neither tool is wired into `npm run build`.

## Phase one: Messenger history reconciliation

`scripts/reconcile-messenger-migration.mjs` is a fixed, no-argument tool. It
can run only in Vercel Production and validates both approved Supabase pooler
connections before it can call Prisma.

Before `prisma migrate resolve --applied 20260729090000_add_messenger_audit_runs`,
it requires all of the following:

1. The migration-file checksum equals the recorded failed-migration checksum.
2. Prisma reports the expected failed Messenger migration and no other state is
   accepted.
3. Prisma introspection reports the expected enum, table columns, primary key,
   foreign keys, and both indexes.

After resolving, it requires Prisma status to report exactly one pending
migration: `20260801090000_add_transaction_payment_splits`. It never deploys
that migration.

The historical Messenger migration is immutable and its checksum matches the
recorded Production failed-migration checksum. RLS remains a separate security
remediation and must not be folded into this reconciliation.

## Phase two: payment split

`scripts/ci-payment-split-migrate.mjs` is a separate, fixed, Production-only
guard that accepts only the payment-split migration. It is deliberately not
wired into the build. A separately authorized PR must wire it into a controlled
Production deployment only after phase one has completed and been independently
verified.
