# SPA PR #970 deployment reconciliation

Scope: integrate main `c39572a7` and subsequent marketing/privacy changes through `03698eef` into the SPA Preview branch. No Production promotion, database reset, legacy table change, or migration-ledger rewrite.

## Deployment path

`prisma/reconciliation/spa-release-schema.sql` defines the complete additive set of 21 Spa tables plus StoreModuleInstallation. It includes entitlement, wallet, payment, receipt, credit sale, refund, booking group, partyGroupId/guestIndex, service locations, resource exclusion constraints, tenant foreign keys, checks, RLS and frontend-role revocations.

Prerequisites are the existing Store/Customer/Staff identity tables, IndustryModule enum, a database-owner connection, and btree_gist availability. This is a module installation on the application identity schema, not a replacement bootstrap for the entire booking system.

The three unapplied PR-only migrations dated September 10–12 are retained in `prisma/reconciliation/archive/` for review. They duplicated structures now present in main and did not contain the complete dependency graph. No main migration was removed or rewritten. Do not replay legacy SPA cutover/backfill migrations for this release, run migrate reset, or use migrate resolve to conceal differences.

The guarded entry point accepts only both URLs identifying test project `ttworfzgwejdeolegkxl`. It refuses Production and does not print credentials:

```sh
node --env-file=.env.spa-preview scripts/spa-release.mjs --rehearse
# Only after reviewing target and SQL, in an authorized test deployment session:
node --env-file=.env.spa-preview scripts/spa-release.mjs --apply-preview
```

Rehearsal creates an isolated identity schema, executes the entire schema twice, checks 212 column definitions and 83 indexes against PostgreSQL-derived fingerprints, and rolls back. Apply uses one transaction, a release advisory lock, lock/statement timeouts, and the same fingerprint checks before commit. Existing extra columns/indexes are retained; conflicting definitions abort rather than being silently accepted. Fingerprint coverage is columns and indexes; foreign keys/checks are separately established by the schema script and resource exclusion constraints remain enforced.

For an existing-data rehearsal, use `spa-release-clone-prefix.sql`, append the complete schema and fingerprint scripts, verify row counts, and ROLLBACK in one authorized test-project session. The prefix copies only SPA rows and minimal shared identity fields to a private schema. It never modifies public tables.

## Verification performed

- Full Vitest: 454 suites / 4,105 tests passed; 3 suites / 32 tests intentionally skipped.
- Full Next.js build and TypeScript passed. Existing generated-client Turbopack tracing warning remains; it does not fail compilation. The warning is not declared fixed.
- Empty private PostgreSQL schema replayed twice successfully.
- All 22 existing module tables copied into a private schema, additive replay succeeded and existing row counts were unchanged.
- The private clone passed the 212-column / 83-index fingerprint check.
- HQ activation regression: ACTIVE SPA with catalog is accepted; missing catalog is rejected. HQ provisioning and onboarding actions now require both HQ session and `staff.manage`.
- Old and new SPA checkout entry points share a scheduling lock; the compatibility path rechecks booking status and refuses an existing receipt before charging.

## Operational limits

The broad public-schema rehearsal was rejected by automatic approval review; no public DDL was applied. Verification continued in isolated schemas and rolled back. Existing Preview already has the operational SPA tables; the complete release script is prepared and rehearsed, not claimed applied to public or Production.

New SPA stores start PROVISIONING and their initial delivery checklist intentionally reports provisioning pending. After HQ provisioning, verification uses actual ACTIVE status and catalog presence; it no longer unconditionally rejects SPA. A live complete HQ create/provision/activate session has not been performed in this turn.

The user-supplied cancellation/rebooking and iPad acceptance belongs to Preview `79b4cbf7`. It is not relabeled as browser acceptance of this main integration. Production approval still requires the exact deployment/schema scope and relevant live regression. Application rollback must retain SPA financial history; do not drop tables to roll back code.
