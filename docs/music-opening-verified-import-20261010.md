# Verified music opening importer (isolated, internal)

This continues the existing draft PR. It adds a server-only verified staging
contract and a transactional ordinary-card importer composed with the existing
opening make-up importer. A restricted staff upload form now invokes that core
at `/dashboard/courses/opening-import`, on the exact authorized Preview only.
There is no source scraper, schedule, new credential or production deployment.

## Evidence and business rules

- `planVerifiedMusicOpeningImport` requires an independently checked manifest
  hash, stable source enrollment/student/plan/lesson keys and exact target IDs.
  A caller-supplied `VERIFIED` string alone is not evidence or authorization.
  The trusted source adapter and approval to import real rights remain separate.
- Raw source fields (including blanks and conflicting displayed dates) are kept
  in the source audit, separate from verified activation/expiry. No date is
  shifted by one day and an empty duration does not imply unlimited validity.
- Source observation time and `balanceAsOf` are distinct. This importer accepts
  only the existing 2026-10-01 Taipei cutoff; a later balance cannot be backfilled
  into it. Later completed/no-show events are held for an actual native-event
  mapping, never silently counted as pre-cutoff consumption.
- Ordinary/make-up separation and make-up expiry policy each require an explicit
  verified business rule. Unknown rules produce `HOLD`; synthetic fixtures do
  not decide those rules for real learners.

## Disjoint accounting and dates

New snapshots reconcile original paid + gift lessons with actual consumed
before cutoff + ordinary remaining + separately backed pre-cutoff make-up
rights. Leave is not fake consumption. `unresolvedMakeupLessons` is never zeroed
to bypass the old guard; legacy snapshots and their hashes remain compatible.

An immutable `ordinarySourceSlots` manifest is stored in the hashed snapshot.
The runtime requires exact lesson key + source term + original ordinal. A
separate make-up slot cannot masquerade as an ordinary `CARD` booking. An
unsupported, incomplete or overlapping allocation is held for review.

Expiry is explicitly `UNKNOWN`, `NO_EXPIRY` or `SPECIFIED` with evidence. The
existing dedicated make-up model supports verified no expiry. The ordinary
writer checks nullable-column and validated CHECK capabilities before
accepting verified no-expiry records. This capability does not establish any
Luby learner's right to unlimited validity. The Luby uploader explicitly holds
NO_EXPIRY declarations because all its packages expire. Unknown expiry remains held. No
sentinel such as 2099 is written and the uploader applies no DDL.

Post-cutoff student leave requires the *existing* exact ordinary card, a source
slot which was ordinary at cutoff, and the actual original cancelled
`STUDENT_LEAVE` booking with the same source-key/term/ordinal. It cannot cause a
new card or another opening make-up entitlement. Completed pairs and no-shows do
not grant opening rights. For a completed pair, its verified completion date is
required separately from the original leave date. A missing date or completion
on/after cutoff is held for native-event reconciliation, never treated as a
pre-cutoff completion just because the original leave was earlier.

## Transaction, replay and isolation

- Internal authenticated entrypoint checks existing `wallet.create` and
  `booking.update` permissions, staff role and exact store. No permission is
  created or expanded. The exact existing Preview branch/repository and both
  isolated DB connections are checked before importing the DB client.
- The writer is fixed to `store-lubymusic` and its verified source alias, with
  exact customer source markers and existing single-owner SESSION plan/course
  mappings. It never resolves a person by name or creates a replacement learner.
- A Serializable transaction takes the shared store lock, verifies source
  key/hash and any explicit expected card/hash, then creates card/member/state,
  independent make-up rows and source audit atomically. It creates no historical
  attendance, point-entry GRANT/debit, purchase, payment, revenue or payroll.
- Same source/content retries skip; different content or target prevalues
  conflict. Replays preserve current ordinary remaining and make-up version;
  they do not refill balances or repeat unchanged audit blocks.
- Per-enrollment batch scope is derived server-side from verified ordinary
  records. Every enrollment has explicit cutoff coverage, including zero rights.
  All earlier rights and dispositions for those enrollments must remain in the
  manifest. Unrelated learners can be imported in later small batches without
  replaying their neighbors. Source identity never includes batch scope.
- Persisted ordinary rows/cards and make-up rows are read back in the same
  transaction. Readback mismatch throws and rolls back. Notification/outbox
  counts for the exact store must be unchanged. The writer never invokes
  `courseTransaction` or a notification sender.
- New batches require a one-minute pre-opening margin for the 30-second
  transaction plus commit overhead. Taipei business hours are checked before
  the batch, before writes and after final readback. An overrun rolls back.
- An uncertain commit is not blindly retried. Reconcile the exact stable source
  keys, content hashes and stored target IDs first. No automatic retry loop is
  introduced.

## Verification scope

All new fixtures are invented. Contract and transactional-mock tests cover
disjoint balances, stable IDs/hash, exact replay, stale prevalues, source-slot
runtime guards, cutoff chronology, unknown/verified unlimited expiry, missing
business rules, per-enrollment completeness, readback rollback, notification
rollback and wrong-store/production rejection. Existing PGlite schema suites
remain relevant for SQL constraints; transactional mocks are not a claim of
real Prisma/PostgreSQL concurrency or live-source acceptance.

The uploader checks existing permissions, role, store, exact Preview connections
and the Taipei work window before reading the file. Its 500 KB envelope contains
`data` and an independently verified `proof`; the server does not generate proof
from the uploaded content. The operator must first reconcile actual source
observations, identities, mappings, dates and cutoff accounting. The browser
receives only status and readback counts, never raw evidence or source IDs.
Pending submission disables controls. Unknown transaction/commit results block
resubmission and require source-key readback; no automatic retry is added.

The upload/action and existing importer suites passed 76 tests; TypeScript and
targeted ESLint passed. These are synthetic engineering checks, not real-source
acceptance or device verification. Preview desktop/iPad checks remain pending.
No real learner rights have been imported by this engineering change. The
generic opening-card booking restrictions remain; this importer does not itself
create post-cutoff bookings or enable daily synchronization.
