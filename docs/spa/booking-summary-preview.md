# SPA booking summary polish

Scope: PR #970 Preview only. No schema migration or database writes in this change.

- Read-only bookings use a historical summary, without disabled wizard steps or Next buttons.
- Service name and quoted amount come from booking snapshots.
- Refund, returned stored value, returned uses, and voids have distinct labels; actual reversal amount/uses are preferred.
- Receipt balance is explicitly a historical checkout snapshot; customer management link provides access to account details under existing permissions.
- Schedule cards and daily history show financial status; grouped bookings identify guestIndex 1 as primary contact and subsequent members as companions 1/2.
- Schedule separators and booking/checkout controls use light earth borders and brand green. Checkout and summary footers respect device bottom safe area.

Validation: 53 targeted tests passed, TypeScript and ESLint checked. Summary is rendered in a test to verify historical content and absence of wizard controls. Existing booking actions and commerce regressions included.

Browser tab refresh still times out after 20 seconds. Visual iPad acceptance and the screenshot floating overlay remain unverified. No matching floating feedback/toolbar component was found in application source; no speculative global hiding of third-party UI was added.
