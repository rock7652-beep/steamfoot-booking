# Historical consultation import: controlled review contract

This is separate from the released HQ list PR. No production import, schema
execution, PR publication, or deployment is authorized by this document.
The repository contains synthetic tests and generic code only. Reviewed source
rows, contacts, raw snapshots, manifests and production receipts stay private.

## Small additive schema surface

- Add nullable `ConsultationLead.legacyImport` JSONB and its Prisma field.
- Extend the two existing Sheet-state CHECKs with `LEGACY_IMPORTED`, a terminal
  observation/import state with both delivery timestamps NULL.
- Require immutable, validated provenance only on historical rows. Preserve
  source UUID, spreadsheet/tab/row coordinates, original source time/status/
  note/delivery marker, content fingerprints, approved manifest/snapshot hashes,
  unresolved numeric-phone warning, and actual import time/actor.
- Keep the existing original-content/transition trigger unchanged; add one
  independent provenance-immutability trigger. No table grants, RLS policies,
  foreign keys or trial-link rules change. Helpers are SECURITY INVOKER.
- SQL lives under `docs/sql`, outside the build migration runner. The SQL is a
  single transaction, not a generally rerunnable migration or automatic backfill.

## Import-core boundary

`consultation-legacy-import.ts` has no database client or network/delivery/trial
service. The SQL adapter builds a target-bound Supabase `execute_sql` request;
the offline CLI generates that packet without opening a connection. An authorized
orchestrator sends the exact verified packet through the connector, checks its
result and separately refreshes the source. No credentials are read or created.
An `explicitApply` boolean is a programming safeguard, never user authorization.

The CLI defaults to summary-only dry-run. Its manifest, snapshot, approved target/
four-UUID envelope and source evidence are owned mode-0600 files in a mode-0700
directory outside Git worktrees. An explicit packet path uses exclusive creation;
apply additionally requires the explicit mode and actor. Stdout/errors contain
only summaries/fixed codes, never source rows or SQL. Private metadata is never
hard-coded in the repository. Preview accepts only the pinned public synthetic
fixture; production metadata comes from the privately reviewed approval envelope.

Source evidence includes a fresh bounded complete canonical-tab UUID column scan
and exactly the four candidate CellData-derived rows. The orchestrator must
verify its timestamps, declared scan bounds and tool origin. Packet construction
and SQL execution both enforce the ten-minute evidence limit. Expired evidence
requires a fresh read, never a manually advanced timestamp.

Default dry-run verifies the exact reviewed manifest bytes and raw snapshot
bytes, the approved UUID set/count, schema-normalized payload hashes, source
row hashes/serial times/status/empty notes, and the exact target identity. It
queries only the approved UUIDs. Names, phones and LINE IDs never merge rows.

Exact existing UUID + payload/date + full matching provenance is skipped. Any
other UUID collision blocks the entire transaction. Apply requires an explicit
mode and actor, a SERIALIZABLE transaction, exact connector project binding,
schema/RLS/grant/function/trigger checks, plain INSERTs, and re-verification before
commit. The SQL rechecks evidence expiry at both ends; it does not read the Sheet.
No fake contact activity, delivery attempt, trial record or relationship is made.
Recheck the source after commit as a separate read-only verification; a Sheet
cannot be atomically locked together with PostgreSQL without editing the source.

This bounded contract accepts only the reviewed batch's `待聯繫` → NEW records
with empty follow-up/cell notes. New statuses, notes, moved source rows or changed
source values return to review rather than being silently remapped. Numeric
telephone strings remain untouched. Synthetic fixtures exercise the expected
4 proposed inserts / 0 skips / 0 conflicts, 13 excluded tests, 14 formula mirrors,
and 2 unresolved numeric-phone warnings. These numbers are a contract fixture,
not a claim that live data will stay unchanged until approval.

## HQ display

Historical rows distinguish original submission time from actual HQ import
time and display the historical-import state. Unverified numeric-source phones
remain visible with a warning and no one-click dial link; original LINE controls
remain available. No phone correction or new verification workflow is invented.
The page reports the actual imported count, without claiming every historical
source is complete. Existing authorization and full-data filtering are retained.

## Checks and remaining release gates

- Synthetic core: default dry-run, exact-id idempotency, whole-batch conflicts,
  source/manifest/snapshot changes, phone preservation, bounded lookups, partial
  failure rollback, and source changes before commit.
- In-memory PostgreSQL: additive DDL, JSON NULL/missing key/date/hash constraints,
  terminal delivery state, original/provenance immutability, ordinary live
  delivery transitions, HQ status updates, and anon/authenticated isolation.
- HQ rendering: real imported count, original vs import date, warning and
  withheld dial shortcut, unchanged ordinary intake behavior.
- Scoped TypeScript and changed-file ESLint are local checks only. Full exact-
  head CI and isolated Preview review remain required after publication approval.
- Connector execution is explicit and has no automatic retry. Following an
  uncertain result, use a fresh read-only reconciliation before another apply.
- Do not regenerate clients into another checkout's shared node_modules. A
  future isolated build must generate the client after reviewing the schema.
- Required order after separate explicit approval: fresh source/UUID/schema
  reconciliation; reviewed additive DDL and post-DDL RLS/grant checks; deploy the
  reviewed compatible code; run the separately bound import adapter against the
  exact manifest/target; verify rows, hashes/times and no outbound/link effects.
- A future rollback must be specifically approved and first inspect subsequent
  edits/history/relationships. Never delete by name, phone, timestamp or a broad
  source label, and never remove original Sheet records.
