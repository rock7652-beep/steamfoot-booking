# Store Organization v1

## Product Boundary

`Store.parentStoreId` represents a store organization view relationship only.
It does not represent ownership, management authority, revenue attribution,
commission, performance ranking, settlement, or operating control.

Each store remains independently operated. Organization changes only affect
which stores can be viewed in a future read-only view mode.

## Data Invariants

- Customers remain scoped to their original `storeId`.
- Bookings remain scoped to their original `storeId`.
- Transactions and revenue snapshots remain scoped to their original `storeId`.
- Service plans, packages, wallets, and sessions remain scoped to their original
  `storeId`.
- Historical records are never rewritten when organization relationships change.
- `parentStoreId` must not create self-parent or cyclic relationships.

## View Mode Boundary

Future view mode allows an upper store staff user to read descendant store data.
It must not enable mutation. Server-side write guards are required; disabled UI
is only a secondary signal.

PR-1 does not connect UI, cookies, dashboard queries, or existing actions to view
mode. It only introduces foundation helpers, types, guard skeletons, tests, and
documentation.

## HQ Analytics Boundary

HQ analytics is separate from store manager view mode. HQ analytics must use
ADMIN/HQ permissions, explicit cross-store query semantics, and separate cache
keys. Store manager view mode must not aggregate descendant KPIs.

## v1 Non-goals

- No dashboard UI.
- No store switcher for non-ADMIN users.
- No mutation behavior changes.
- No schema or migration changes.
- No production data updates or backfill.
- No descendant KPI aggregate on the dashboard home.
- No cross-store revenue attribution.
- No staff/user management across descendant stores.
- No HQ analytics implementation.
