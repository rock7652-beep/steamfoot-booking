# SPA cash/card checkout — Preview only

The SPA schedule uses `SpaReceipt` for a single full payment of the booking's saved price. CARD records an in-store card-terminal payment; no card processing or card details are collected. No discount, stored-value debit, session deduction, group payment, or refund is implemented by this action. `transaction.create` and `booking.update`, active store membership, SPA module and ACTIVE installation are required.

`completeSpaBooking` holds the same store advisory lock used by create/change/cancel. It creates the receipt and marks the booking COMPLETED in one Prisma transaction. The unique booking/store index prevents duplicate receipts. Identical retry returns the original receipt; changed amount or payment method is rejected. Completed bookings cannot be changed or cancelled through the scheduling actions.

The reviewed DDL is `scripts/spa-checkout-schema.sql`. It was applied only to test project `ttworfzgwejdeolegkxl` using Supabase migration `add_isolated_spa_checkout_receipts`. No existing Prisma migration history was changed. This DDL is intentionally not run by the build. Any future environment must apply this reviewed SPA-only DDL before enabling the code; Production deployment is not authorized by this work.

Verification: TypeScript, ESLint, 31 related tests including ten checkout cases, and `scripts/test-spa-checkout-constraints.sql` on the test database. The SQL test checks unique receipts, cross-store foreign keys, nonnegative amounts, supported payment methods, rollback and client access; all test rows are rolled back. Browser checkout acceptance and a real two-session application concurrency test remain pending.
