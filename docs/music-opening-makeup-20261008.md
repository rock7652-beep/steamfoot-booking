# Opening make-up entitlements: isolated draft

This extends the existing music draft PR only. No production merge, real-data import, source sync, credentials or deployment configuration changes are included.

## Source and balance contract

- Verified outstanding pre-cutoff rights become `CourseMusicOpeningMakeupEntitlement` rows. A later native student leave remains its actual original booking/card; it is never inserted as another opening right.
- Stable source and original-slot identities prevent duplicate rights. A source revision or cutoff change cannot hide prior completed/no-show receipts. All dispositions live in existing `AuditLog`.
- The batch requires independently verified, current, complete source evidence, confirmed dates, student/course/class mappings, expiry and disjoint balance backing. Unknown or overlapping ordinary balance blocks import.
- Completed historical pairs and no-shows produce no right. Synthetic examples contain no actual learner data.
- Original `unresolvedMakeupLessons` is not zeroed. Existing ordinary-card mutations remain blocked until their original complete cutoff/source mapping checks are met. This feature does not claim a real source adapter or unlock unresolved opening cards.

## Lifecycle

Staff-only route: `/dashboard/courses/opening-makeups`. Existing course navigation links here for music stores. Permission checks exist on the page and every server action.

Reservation preserves the outstanding count. Check-in is not attendance. Explicit actual attendance redeems the right; an audited correction restores it. Cancellation or teacher absence releases the same right. No-show redemption/forfeiture remains unsupported because its policy is unverified.

All mutations lock the store, then the entitlement; compare expected versions; validate actual booking/session/customer/class/date/expiry; enforce capacity and overlap; and commit booking, version and request receipt together. Exact retries return the first result; conflicting keys and stale versions fail. A partial unique index is the final duplicate-spend barrier.

The unified read projection includes reserved rights in outstanding totals and follows actual native leave chains. It explicitly reports the number of verified learners covered. It does not add either count to ordinary card balance. Upstream source identities and raw snapshots remain server-side.

## Effects deliberately excluded

This path creates no point entries, ordinary balance changes, purchases, payment/revenue records, payroll payments, notification queue items or outbound sends. It does not modify `CourseSession`, whose existing triggers can enqueue notices. Generic mutation/fee/notification entrypoints reject or exclude the dedicated kind/link. Teacher compensation stays `UNVERIFIED` with a null amount, including fixed-fee and legacy calculations.

## Schema and deployment

Exact SQL is in `docs/sql/music-opening-makeup-20261008.sql`, outside automatic migrations. It adds one table, one nullable booking relation, indexes/constraints, and source immutability protection. The existing booking-values check is extended while preserving old branches. No other pending migration may run.

The existing build/runtime database provenance checks remain unchanged in scope. Their read-only schema capability check additionally requires this table, relation, RLS/client denial, uniqueness and immutable-source trigger. Missing schema fails closed. `vercel.json` remains byte-for-byte current public main ef25f6a1 (including the authorized sports-roster deployment entry).

## Verification status at initial publication

- 432 focused tests pass locally across 24 files (domain, guards, services, importer, reader, UI interaction and counts); the domain subset has 67 tests. Additional established guard regression suites were also exercised.
- Prisma generation/validation and focused ESLint pass.
- Local whole-repository TypeScript process exits 137 without diagnostics; not a typecheck pass.
- Local PGlite process also exits 137, even for a standalone query. Local SQL assertions are unexecuted.
- New PostgreSQL suite uses the existing explicit loopback-only disposable test database guard and real Prisma service transactions. It covers import replay, reserve races, cancel/rebook and attend/correct ordering, rollback, constraints and zero accounting/notification side effects. Remote exact-head CI must pass without skips before isolated DDL/UI acceptance is claimed.
- Browser/device and isolated persistent-fixture verification are pending at this first source publication. Later evidence should append exact commit, CI and deployment links; do not reinterpret synthetic/mocked tests as browser acceptance.
