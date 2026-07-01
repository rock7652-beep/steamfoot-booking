# Store Organization v1 Release Note

Release:

SteamFoot 2.0 - Organization Edition.

Status:

GA.

Production Release Review:

PASS.

## Product Background

Store Organization v1 is not a multi-store management feature.

It establishes:

- Store Organization.
- View Mode.
- HQ brand organization structure.

The purpose is to let the brand grow while each store remains independently
operated.

Store Organization represents view relationships, not management relationships.
View Mode provides full reading capability without any data mutation capability.

## Core Capabilities

Store Organization v1 includes:

- HQ store organization tree.
- View Mode.
- Dashboard Full Read.
- Customers Full Read.
- Bookings Full Read.
- Plans Full Read.
- Cash Drawer Full Read.
- Reports Full Read.

All supported modules follow:

> View Mode = Full Read, Zero Write.

## Product Principles

### Independent

Stores are always independent. Store Organization does not change customer,
booking, revenue, plan, cash drawer, report, or historical ownership.

### View Relationship

Store Organization only represents who may view descendant stores. It does not
grant management authority, revenue attribution, commission, settlement, ranking,
or operational control.

### Understand First, Change Second

The system should help people understand before they change. Reading is the
default posture; editing must be intentional.

### View Mode = Full Read, Zero Write

View Mode gives complete reading capability across supported modules. Any action
that changes data is blocked by product behavior and server-side permission
guards.

### Respect

The system exists to build trust, support, companionship, and shared experience.
It is not a tool for interference.

## Store Organization Definition

Store Organization represents a view relationship, not a management
relationship.

View Mode provides full read access and no data mutation capability.

## Included Modules

### HQ Store Organization

HQ can view the brand organization and maintain upper-store relationships.
Organization changes affect only view access. They do not move data between
stores.

### View Mode

Store managers can switch from their own store into a descendant store for
read-only understanding.

The global View Mode banner clearly shows the currently viewed store and
provides a path back to the user's own store.

### Dashboard

View Mode reads the descendant store dashboard while disabling operational
actions.

### Customers

View Mode supports complete reading of customer lists and customer details while
blocking customer creation, edits, exports, assignments, and other mutations.

### Bookings

View Mode supports booking calendar/list/detail reading while blocking booking
creation, edits, cancellation, check-in, completion, payment, makeup sessions,
and rescheduling.

### Plans

View Mode supports plan and customer plan reading, including remaining sessions,
usage records, effective dates, expiration dates, and plan details. Any action
that changes the customer-store contract is blocked.

### Cash Drawer

View Mode supports read-only cash drawer and cashbook review while blocking
open, close, cash movement, edit, delete, adjustment, and export paths.

### Reports

View Mode supports single-store report reading only. It does not provide export
or cross-store aggregate analytics.

## Production Release Review

Production URL:

https://www.steamfoot.com

Release review result:

PASS.

Validated:

- HQ login and store organization page.
- Store manager normal mode.
- View Mode switch to descendant store.
- Dashboard, Customers, Bookings, Plans, Cash Drawer, and Reports reading in
  View Mode.
- Zero Write behavior across supported modules.
- Reports export unavailable in View Mode.
- Return to own store.
- Refresh after return.
- Logout/Login returning to the user's own store.
- No browser console errors observed during release smoke.

## Closing Note

Store Organization v1 is not a new "multi-store management" feature.

It establishes an architecture where the brand can keep growing while each store
keeps independent operation.

View Mode follows Full Read, Zero Write: complete reading, no operation.

Store Organization represents view relationships, not management relationships.

The purpose of the system is not to increase control. It is to build trust,
companionship, and shared experience.
