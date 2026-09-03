# Store Organization v1 Demo Checklist

Use this checklist for Store Organization v1 demos and release walkthroughs.

Demo environment:

- Production or an approved production-like staging environment.
- Use approved test accounts only.
- Do not create, edit, delete, export, receive payment, open cash drawer, or
  close cash drawer during the demo.

## HQ

- Log in as HQ/Admin.
- Open the HQ stores page.
- Open the HQ store organization page.
- Confirm the brand organization tree is visible.
- Confirm the tree communicates store relationships in business language.
- Demonstrate where HQ can adjust organization relationships.
- Explain that organization changes affect view access only.
- Explain that organization changes do not affect customers, bookings, revenue,
  plans, cash records, reports, or history.

## Store Manager - My Store

- Log in as a store manager.
- Confirm the left switcher shows "我的店".
- Open Dashboard.
- Open Customers.
- Open a Customer Detail page.
- Open Bookings.
- Open a Booking Detail page.
- Open Plans.
- Open Cash Drawer.
- Open Reports.
- Confirm normal mode behavior is unchanged.

## View Mode

- Open the store switcher.
- Select a descendant store.
- Confirm the global View Mode banner appears.
- Confirm the banner shows the currently viewed store.
- Confirm the banner says operations must be completed by that store.

### Dashboard

- Confirm dashboard data reads from the viewed store.
- Confirm operational actions are hidden or disabled.

### Customers

- Confirm customer list reads from the viewed store.
- Open a customer detail.
- Confirm customer data is fully readable.
- Confirm customer creation, edit, export, assignment, and other mutations are
  unavailable.

### Bookings

- Confirm booking calendar/list reads from the viewed store.
- Open booking detail or booking drawer.
- Confirm booking data is fully readable.
- Confirm create, edit, cancel, check-in, complete, payment, makeup session,
  and reschedule actions are unavailable.

### Plans

- Confirm plans and customer plan information are readable.
- Confirm remaining sessions, used sessions, effective date, expiration date,
  and usage records are readable.
- Confirm create, edit, assign, extend, deduct, add-back, refund, and delete
  actions are unavailable.

### Cash Drawer

- Confirm cash drawer status is readable.
- Confirm cash movement/cashbook information is readable.
- Confirm open, close, create cash movement, edit, delete, adjust, and export
  actions are unavailable.

### Reports

- Confirm reports read from the viewed store only.
- Confirm there is no cross-store aggregate report.
- Confirm export is hidden or disabled.

## Return To My Store

- Click "返回我的店".
- Confirm the View Mode banner disappears.
- Confirm the switcher returns to "我的店".
- Confirm data returns to the user's own store.
- Confirm normal operations are restored.

## Refresh

- Refresh the page after returning to the user's own store.
- Confirm the user remains on the user's own store.
- Confirm the View Mode banner does not reappear.

## Logout / Login

- Log out.
- Log in again with the same store manager account.
- Confirm the user returns to the user's own store.
- Confirm View Mode is not persisted after login.

## Demo PASS Criteria

- HQ organization page is readable.
- Normal mode remains unchanged.
- View Mode provides full reading across supported modules.
- View Mode provides zero write access across supported modules.
- Return to own store works.
- Refresh after return keeps the user on the user's own store.
- Logout/Login returns the user to the user's own store.

## Demo FAIL Criteria

- Any module shows mixed data from own store and viewed store.
- Any View Mode mutation can be executed.
- Reports can be exported in View Mode.
- Return to own store leaves the user in View Mode.
- Logout/Login returns the user to a viewed descendant store.
