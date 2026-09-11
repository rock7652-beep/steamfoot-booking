# SPA desktop brand pass

Scope: PR #970 Preview only. No database writes, migration, or Production changes.

## Design contract

- SPA shell scopes typography and colours with `data-spa-admin`; steamfoot and customer-facing pages retain their styles.
- Page titles 24px; section titles 18px; drawer titles 20px; body and tables 14px; supporting text 13px.
- Desktop fields/actions 40px; coarse-pointer controls at least 44px. Phone form text remains 16px to avoid input zoom.
- One outer page gutter, maximum content width 1440px. Desktop sidebar 216px, compact tablet sidebar 184px.
- Warm light borders, olive primary actions, restrained gold accents. Refund/cancellation and schedule status colours retain their meaning.
- Date and start-time fields share a row. Timeline staff columns cap at 320px; appointment height/time calculations are unchanged.
- Home renders a permission-filtered workspace instead of redirecting to the schedule. Brand links preserve the current store prefix.

## Verification

Authenticated stable Preview alias, viewport width 1363px:

- Home rendered with title Home (首頁), six authorised shortcuts and retained `/s/spa-module-qa-20260903/admin/dashboard` URL.
- Customers, plans, staff, service locations and revenue: measured title 24px; tables 14px; no document horizontal overflow.
- Customer drawer opened without navigation; measured width 620px and title 20px.
- Booking drawer opened; service selection and next step worked; date/time displayed side by side, each 40px high, drawer width 600px. Draft was closed without submission.
- Settings page loaded with the shared SPA theme.
- TypeScript, ESLint, CSS compilation and 19 navigation/customer-drawer/revenue regression tests passed.

Limit: this pass verified the desktop viewport above. iPad portrait/landscape physical-device acceptance remains a separate visual check; no new database or checkout acceptance is claimed.
