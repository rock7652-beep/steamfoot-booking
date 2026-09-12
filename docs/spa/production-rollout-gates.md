# SPA production rollout gates

Status: preparation only; NOT approval to deploy or write Production.

## Release scope

Integrate main b392c18145c6aec07053e2b00b8b196f850994be with PR #970.
Preserve main's LIFF identity fixes, device preview and green/gold styling,
and SPA's isolated routes, transactions, permissions and pricing rules.
Recheck main and the PR head immediately before any future release.

## Mandatory evidence before Production

1. Record the actual Production project identity without disclosing credentials.
   Confirm both Prisma clients and all required configuration use Production,
   not the Preview test database. Never promote the test-connected Preview
   artifact directly to Production.
2. Read-only inventory: migration ledger, existing SPA tables/columns/indexes,
   foreign keys, checks, exclusion constraints, RLS/grants and btree_gist.
   Compare with the exact release SQL and both Prisma schemas. Existing test
   fingerprints are not evidence of Production compatibility.
3. Record a current recoverable backup/PITR point, retention and restore owner.
   Prove restoration in a separate approved environment; record restoration
   time and acceptable data-loss window. A claimed backup without restore
   evidence does not satisfy this gate.
4. Review an exact additive SQL plan against that inventory. Preserve legacy
   Booking/Transaction/Treatment, existing data and migration history. Do not
   reset, drop tables, conceal drift with migrate resolve, or relax constraints.
5. Rehearse that plan on an approved restored copy, verify row counts and full
   constraints, repeat safely and exercise failure rollback. Inventory and
   rehearsal have NOT been performed against Production by this integration.
6. Prepare a separately reviewed Production runner with exact target and SQL
   checksum, transaction, advisory lock, timeouts and postconditions. Do not
   remove the test guard from scripts/spa-release.mjs. The existing runner
   deliberately rejects Production and is not a Production deployment path.
7. Confirm PRODUCTION_MIGRATION_TARGET configuration before building. The build
   invokes scripts/ci-migrate.mjs; no generic npm build is part of a read-only
   database inspection. An unset target skips migration; an explicitly approved
   target can write. It does not install the SPA reconciliation automatically.
8. Obtain explicit approval for the exact Production SQL, merge and deployment.
   Deploy with Production configuration only after the schema gate passes.

## Verification and recovery

On the integrated Preview recheck HQ/owner login, cross-store denial, Steamfoot
LIFF identity and bookings, SPA booking/reschedule/cancel/rebook, checkout,
refund and group settlement, plus desktop/iPad layouts. Historical browser
acceptance cannot be relabeled as acceptance of this integration.

Capture the previous Production deployment identifier immediately before
release. If application smoke tests fail, stop rollout and restore the prior
compatible application deployment. Keep additive SPA tables and financial
history; code rollback is not database rollback. Database recovery requires
the approved restoration procedure, a write pause and reconciliation of writes
since the backup. Never delete tables or financial records as a shortcut.

Cloudflare remains outside the user's current scope, not a passed CI check.
