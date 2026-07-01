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

View Mode principle:

> Full Read, Zero Write.

The context shape is:

- `ownStoreId`: the staff user's own operating store.
- `viewedStoreId`: the store currently being viewed.
- `isViewMode`: true when a non-HQ staff user is viewing a descendant store.
- `canWrite`: false in view mode.

PR-1 introduced foundation helpers, types, guard skeletons, tests, and
documentation.

PR-3 connects only the shell foundation:

- A session-scoped `viewed-store-id` cookie.
- A dashboard shell switcher with "我的店" and "查看下層店".
- A global "查看模式" banner with "返回我的店".
- Server-side validation that only descendants can be selected.
- `requireWritablePermission()` remains the write guard skeleton for future
  action wiring.

PR-3 still does not connect dashboard, bookings, customers, plans, cash drawer,
reports, or HQ analytics to `viewedStoreId`. Those modules must be wired in
separate PRs with module-specific read filters, mutation guards, and cache keys.

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

## PR-2 HQ Organization UI

HQ may maintain `Store.parentStoreId` from `/hq/dashboard/stores/organization`.
This UI is ADMIN-only and is limited to organization maintenance:

- Show the current store tree.
- Preview a store's previous and next parent before submit.
- Confirm before mutating `Store.parentStoreId`.
- Reuse the PR-1 self-parent and cycle guard.
- Write a generic `AuditLog` row with before/after parent snapshots.

This still does not activate store manager view mode. Dashboard, bookings,
customers, reports, and HQ analytics remain unchanged.

## PR-3 View Mode Foundation

PR-3 activates the shell-level view mode context without module integration.

Scope:

- Resolve `ownStoreId`, `viewedStoreId`, `isViewMode`, and `canWrite`.
- Let store staff switch between "我的店" and descendant stores.
- Show a global read-only view-mode banner when viewing a descendant store.
- Clear view-mode cookies on logout / context clear.
- Keep all existing module reads and writes unchanged.

Non-goals:

- No dashboard support.
- No bookings support.
- No customers support.
- No plans/packages support.
- No cash drawer support.
- No reports support.
- No HQ analytics.
- No schema or migration.
