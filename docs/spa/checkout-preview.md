# SPA cash/card checkout — Preview only

The SPA schedule uses `SpaReceipt` for a single full payment of the booking's saved price. CARD records an in-store card-terminal payment; no card processing or card details are collected. No discount, stored-value debit, session deduction, group payment, or refund is implemented by this action. `transaction.create` and `booking.update`, active store membership, SPA module and ACTIVE installation are required.

`completeSpaBooking` holds the same store advisory lock used by create/change/cancel. It creates the receipt and marks the booking COMPLETED in one Prisma transaction. The unique booking/store index prevents duplicate receipts. Identical retry returns the original receipt; changed amount or payment method is rejected. Completed bookings cannot be changed or cancelled through the scheduling actions.

The reviewed DDL is `scripts/spa-checkout-schema.sql`. It was applied only to test project `ttworfzgwejdeolegkxl` using Supabase migration `add_isolated_spa_checkout_receipts`. No existing Prisma migration history was changed. This DDL is intentionally not run by the build. Any future environment must apply this reviewed SPA-only DDL before enabling the code; Production deployment is not authorized by this work.

Verification: TypeScript, ESLint, 31 related tests including ten checkout cases, and `scripts/test-spa-checkout-constraints.sql` on the test database. The SQL test checks unique receipts, cross-store foreign keys, nonnegative amounts, supported payment methods, rollback and client access; all test rows are rolled back. Browser checkout acceptance and a real two-session application concurrency test remain pending.

## 2026-09-10: existing SPA credit settlement

The same checkout panel now supports CASH, CARD, STORED_VALUE and ENTITLEMENT.
Credit options are read from the existing isolated SpaEntitlement/Use and SpaStoredValueWallet/Entry tables; this change does not create another customer wallet or alter legacy financial tables.

- Stored value debits the full stored booking amount with a conditional balance update. Ledger DEBIT amounts are signed negative; receipt amount is the service amount, not a second cash receipt.
- Entitlements must belong to this store/customer, be ACTIVE and valid both on the booking date and today in Taipei. A treatment-specific entitlement must cover every booking item; one use is consumed per item. Generic entitlements with no treatment mapping are not inferred to cover arbitrary services. Mixed services that need different packages or split payment are not supported in this increment.
- Available uses exclude existing RESERVED uses. Bookings with prior successful SpaPayment, RESERVED/COMPLETED entitlement use or stored-value DEBIT are blocked for reconciliation rather than charged twice.
- The store advisory lock, wallet conditional UPDATE, entitlement row lock, ledger unique keys and one receipt per booking protect against duplicate/overdrawn writes. Debit, ledger, receipt and booking completion share one transaction. Identical retries return the original receipt; changing the method or source is rejected.
- Receipt source, resulting balance and uses persist for later inspection. Refreshing the booking shows the settlement method and remaining balance/uses. Historical receipt balances are snapshots, not live wallet balances.
- This increment consumes existing customer holdings; sale/issuance of packages, top-ups, mixed payments, group checkout and refunds are separate work.

Deployment prerequisite: reviewed scripts/spa-checkout-credit-schema.sql applied only to verified test project ttworfzgwejdeolegkxl after the original receipt DDL. Existing SPA credit tables are required; do not run against a fresh DB or Production without a separately reviewed baseline.

Verification: 43 tests across five checkout/booking/provider/isolation suites passed; actual test DB scripts/test-spa-checkout-credit.sql passed debit, insufficient funds, cross-store denial, duplicate ledger, entitlement deduction, rollback and receipt constraints. All SQL fixtures rolled back. Browser connection still timed out; browser checkout, iPad/desktop visuals and simultaneous browser requests remain unverified.
