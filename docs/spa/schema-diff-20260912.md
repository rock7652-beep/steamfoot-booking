# Production versus Preview SPA inventory — 2026-09-12

Application: c6f38749. Production was read-only. This is a schema inventory,
not approval to deploy or evidence of backup restoration.

## Missing in Production (present in Preview)

- SpaBookingGroup
- SpaCreditSale
- SpaPackage
- SpaPaymentRevision
- SpaReceipt
- SpaRefund
- SpaServiceLocation
- SpaTreatmentServiceLocation
- StoreModuleInstallation

Existing table missing column: SpaBooking.serviceLocationId.
Shared columns have matching PostgreSQL type and nullability in this inventory.
SpaceFeeRecord is excluded from the SPA constraint
inventory (its name happens to start with Spa).

## Constraints

Catalog inventory: Production 47 constraints, Preview 104. There are 57
Preview constraint names absent from Production. These include constraints
on tables absent from Production, not 57 defects in existing tables.
SpaStaffCompensation_value_check also differs and requires semantic review
before replay. Do not assume same-named constraints have the same definition.
Production has zero unfinished, non-rolled-back Prisma migration entries;
that does not prove schema equivalence or authorize migrate deploy.

## Preview-only security repair

Enabled RLS in one transaction with 3-second lock and 15-second statement
timeouts on SpaServiceLocation, SpaTreatmentServiceLocation and
StoreModuleInstallation in ttworfzgwejdeolegkxl. No row changes, role grants,
new policies or migration-ledger rewrites were made.
Post-check confirms all three have RLS enabled and neither anon nor
authenticated has SELECT/INSERT/UPDATE/DELETE table privileges. Existing
release SQL already enables RLS; no new migration was needed for this repair.

## Outstanding gates

Approved deployment SQL must resolve the differences below;
approved restored-copy rehearsal; current backup/PITR point and actual restore
evidence; integrated-version complete Steamfoot/SPA browser write regression.
Connected tools do not expose backup restoration evidence. Do not equate a
healthy project, WAL setting or successful Preview with a recoverable backup.

## Extended read-only catalog review

- Indexes: Production 53, Preview 88. All 53 shared names have identical
  definitions. The 35 absent indexes comprise 30 on missing tables, three on
  SpaBooking (including both exclusion-constraint backing indexes), and two on
  SpaStaffCompensation (`staffId_isActive_idx`, `staffId_storeId_key`).
- `btree_gist` is absent in Production and present in Preview. It is required
  by the staff/location exclusion constraints. Existing release SQL creates it.
- Defaults: Production 38, Preview 49. Shared defaults agree; 12 defaults
  belong to missing tables. Production alone gives SpaStaffCompensation.updatedAt
  CURRENT_TIMESTAMP. Preserve/document this existing default unless a separately
  reviewed change requires removal; do not blindly erase it to match Preview.
- Public enum catalogs: 307 versus 312 labels. Shared labels/order match.
  Production lacks StoreModuleInstallationStatus (PROVISIONING, ACTIVE, FAILED)
  and StaffAvailabilityExceptionType (UNAVAILABLE, AVAILABLE). The latter is
  non-SPA and must be reviewed in the main Prisma migration scope, not silently
  bundled into an SPA-only reconciliation. Existing Spa* enums match.
- Compensation constraint: Production accepts any nonnegative value; Preview
  restricts PERCENTAGE to 0..100 and FIXED to nonnegative. Read-only aggregate
  found zero compensation rows and zero violations in Production.
- Production has zero PENDING/CONFIRMED SpaBooking rows; malformed time count
  and overlapping staff-pair count are zero. This is a point-in-time aggregate,
  not a guarantee against data changes before deployment.

## Release-script gap

Update: the compensation constraint and both missing indexes are now included
in release SQL, with a row preflight before replacement. The fingerprint checks
the exact validated constraint and index definitions. Five release-guard tests
pass. An isolated transaction on Preview replayed this compensation section
twice against a synthetic legacy table, retained three valid rows and the
updatedAt default, and rejected percentage 101 and fixed -1. The transaction
was rolled back. This is a targeted rehearsal, not a full restored-Production
rehearsal or backup restoration evidence. No Production changes were made.

Original finding (resolved by the update above):

`spa-release-schema.sql` does not currently define the strengthened
SpaStaffCompensation_value_check or the two additional compensation indexes.
The fingerprint does not assert them either. Therefore an empty-schema replay
does not demonstrate equivalence to the live Preview schema. Resolve this in
an explicitly reviewed deployment artifact and rehearse against a restored copy.
The current runner remains test-project-only; its Production guard was not changed.

## Integrated Preview browser write regression

Stable branch alias, application c6f38749 with doc-only 9a763b7f update,
SPA test shop spa-module-qa-20260903. No Production writes.

- Occupied 10:00 slot: no eligible location and Next disabled. This verifies
  UI availability blocking, not a concurrent double-submit race.
- Created test booking cmty0zara0001i8042gm8r0bb at 11:00–12:00;
  reload retained it; DB confirmed CONFIRMED and the selected location.
- Cancelled through the confirmation dialog. DB confirmed CANCELLED,
  non-null cancelledAt and retained historical serviceLocationId.
- Rebooked the same staff, location and time as cmty12exg0004i804fvy3j0vj.
- Completed that booking with test CASH 900. Receipt
  cmty13c0u0007i804ivy6v20l and COMPLETED status verified in DB.
- Customer right-side drawer opened without leaving the customer list;
  service and receipt tabs displayed these records.
- Voided only this test receipt using the revenue 'delete incorrect entry'
  dialog. DB confirmed reversal amount 900 and exactly one VOID audit row.
  Net revenue fell from 10,900 to 10,000. This is a void/reversal test, NOT
  evidence that the standalone refund workflow passed on this version.
- Both test booking histories and receipt/reversal/audit records are retained.
  Pre-existing customer wallets/packages/bookings were not altered.

Still unverified on this integrated version: date/time input via this browser
control (date fill did not update the field), rescheduling, concurrent browser
submissions, standalone refund, other payment methods/group checkout, and
Steamfoot write regression with the appropriate authenticated test-shop context.
Older-version acceptance must not be substituted for these outstanding checks.
