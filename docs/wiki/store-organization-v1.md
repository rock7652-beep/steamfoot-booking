# Store Organization v1

Store Organization v1 lets SteamFoot represent brand organization while keeping
each store independently operated.

It is built around one rule:

> Store Organization represents a view relationship, not a management
> relationship.

## What Is Store Organization?

Store Organization shows how stores are related in the brand.

For example:

```text
HQ
└── 暖暖蒸足
    ├── 暖沐蒸足
    └── 以斯帖蒸足坊
```

This means an upper store can be allowed to view descendant stores. It does not
mean the upper store owns, manages, ranks, settles, or controls those stores.

## What Is View Mode?

View Mode is a read-only mode for viewing a descendant store.

View Mode follows:

> Full Read, Zero Write.

In View Mode, the user can understand another store's operations without
changing that store's data.

## What Can Be Viewed?

View Mode supports reading:

- Dashboard.
- Customers.
- Customer Detail.
- Bookings.
- Booking Detail.
- Plans and customer plan information.
- Cash Drawer and cashbook information.
- Reports.

## What Cannot Be Done?

View Mode does not allow:

- Creating records.
- Editing records.
- Deleting records.
- Assigning plans.
- Changing bookings.
- Receiving payments.
- Opening or closing cash drawer.
- Creating cash movements.
- Exporting reports.
- Running cross-store analytics.

## Returning To My Store

Use "返回我的店" to leave View Mode.

After returning:

- The View Mode banner disappears.
- The switcher shows "我的店".
- Data returns to the user's own store.
- Normal operations are restored.

Refresh after returning keeps the user on the user's own store.

Logout/Login also returns the user to the user's own store.

## HQ Organization Page

HQ can use the store organization page to view and maintain organization
relationships.

Changing organization relationships only changes view access. It does not move
or rewrite:

- Customers.
- Bookings.
- Revenue.
- Plans.
- Cash records.
- Reports.
- Historical data.

## Product Philosophy

Store Organization v1 is not a control system.

It helps the brand understand, support, and share experience across stores while
respecting store independence.

The system should help people understand first, then change only when necessary.
