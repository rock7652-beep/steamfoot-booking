# RFC-001: Store Organization v1

## Status

GA.

Production Release Review:

PASS.

Release milestone:

SteamFoot 2.0 - Organization Edition.

## Product Definition

Store Organization represents a view relationship, not a management
relationship.

View Mode provides full read access and no data mutation capability.

Store Organization v1 is not a multi-store management system. It is the
foundation for a brand to grow while each store remains independently operated.

## Product Boundary

`Store.parentStoreId` represents a store organization view relationship only.
It does not represent ownership, management authority, revenue attribution,
commission, performance ranking, settlement, or operating control.

Each store remains independently operated. Organization changes only affect
which stores can be viewed in read-only view mode.

## Product Principles

### Independent

Each store remains independently operated. Customers, bookings, revenue, plans,
cash records, reports, and history remain scoped to the operating store.

### View Relationship

Store Organization only defines who may view descendant stores. It does not
grant operational control over another store.

### Understand First, Change Second

The system should help HQ and upper stores understand the organization before
changing it. Reading is the default posture; editing must be intentional.

### Full Read, Zero Write

View Mode allows complete reading of supported modules and blocks all mutation
paths. Disabled UI is a secondary signal; server-side guards are required.

### Respect

The system exists to build trust, support, and shared experience. It must not
turn store organization into interference, ranking, or control.

## Data Invariants

- Customers remain scoped to their original `storeId`.
- Bookings remain scoped to their original `storeId`.
- Transactions and revenue snapshots remain scoped to their original `storeId`.
- Service plans, packages, wallets, and sessions remain scoped to their original
  `storeId`.
- Historical records are never rewritten when organization relationships change.
- `parentStoreId` must not create self-parent or cyclic relationships.
- Organization changes do not affect customers, bookings, revenue, plans,
  packages, cash records, reports, or historical data ownership.

## View Mode Boundary

View Mode allows an upper store staff user to read descendant store data. It
must not enable mutation.

View Mode principle:

> Full Read, Zero Write.

The context shape is:

- `ownStoreId`: the staff user's own operating store.
- `viewedStoreId`: the store currently being viewed.
- `isViewMode`: true when a non-HQ staff user is viewing a descendant store.
- `canWrite`: false in view mode.

View Mode must reset to the user's own store after returning, refreshing after
return, logout, or login.

## HQ Analytics Boundary

HQ analytics is separate from store manager view mode. HQ analytics must use
ADMIN/HQ permissions, explicit cross-store query semantics, and separate cache
keys. Store manager view mode must not aggregate descendant KPIs.

## v1 Non-goals

- No cross-store management.
- No descendant KPI aggregate on the dashboard home.
- No cross-store revenue attribution.
- No commission or settlement behavior.
- No performance ranking.
- No staff/user management across descendant stores.
- No HQ analytics implementation.
- No mutation capability in View Mode.

## Implementation Status

| Area | Status | Notes |
| --- | --- | --- |
| Foundation | GA | Organization helpers, view context, write guard foundation, and tests are complete. |
| HQ Organization | GA | HQ can view and maintain the store organization tree. |
| View Mode | GA | Store managers can switch to descendant stores and return to their own store. |
| Dashboard | GA | Full Read, Zero Write. |
| Customers | GA | Full Read, Zero Write for list and detail. |
| Bookings | GA | Full Read, Zero Write for list/calendar and detail. |
| Plans | GA | Full Read, Zero Write for plans and customer plan information. |
| Cash Drawer | GA | Full Read, Zero Write for cash drawer and cashbook information. |
| Reports | GA | Single-store Full Read, Zero Write. No export in View Mode. |

## Production Release Review

Status:

PASS.

Production URL:

https://www.steamfoot.com

Validated flows:

- HQ login.
- HQ stores page.
- HQ store organization page.
- Store manager normal mode.
- View Mode switch to descendant store.
- Dashboard, Customers, Customer Detail, Bookings, Booking Detail, Plans, Cash
  Drawer, and Reports in normal mode.
- Dashboard, Customers, Bookings, Plans, Cash Drawer, and Reports in View Mode.
- Full Read, Zero Write behavior across supported modules.
- Reports export hidden/disabled in View Mode.
- Return to own store.
- Refresh after return.
- Logout and login returning to the user's own store.

Browser console error log:

None observed during production release smoke.

## Release Statement

Store Organization v1 is GA as part of SteamFoot 2.0 - Organization Edition.

Store Organization v1 does not introduce multi-store management. It establishes
a product architecture where the brand can grow, upper stores can understand
descendant operations, and each store still keeps independent ownership of its
customers, bookings, revenue, plans, cash records, reports, and history.
