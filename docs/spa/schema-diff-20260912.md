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
Defaults, full indexes, enum values and data compatibility are not certified by
this column comparison. SpaceFeeRecord is excluded from the SPA constraint
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

Full indexes/defaults/enums and existing-row constraint compatibility review;
approved restored-copy rehearsal; current backup/PITR point and actual restore
evidence; integrated-version complete Steamfoot/SPA browser write regression.
Connected tools do not expose backup restoration evidence. Do not equate a
healthy project, WAL setting or successful Preview with a recoverable backup.
