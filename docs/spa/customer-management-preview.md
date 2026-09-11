# SPA customer management Preview update — 2026-09-11

Based on PR #970 head ecf485383570c581cb9e4bb177688ebdda84f542.

## Changes

- Customer list shows recent completed service, next active booking, each valid package's available uses, wallet balance and internal service-note summary. Separate services are never summed into a single session count.
- Search retains the namespaced store route; visit filters and drawer closure preserve the current list. The existing 100-result limit is explicitly disclosed.
- Whole-row opening, hover/focus prefetch and a store/list-scoped profile cache. Default drawer is customer overview; credit and service/account history are separate sections.
- Notes are editable in place with writable permissions, store-scoped conditional updates and a content-free audit. Concurrent changes reject stale saves; failed saves retain input. An explicit reload can replace the draft.
- Financial actions retain the existing SPA purchase/refund implementations. Successful mutations invalidate the drawer and refresh list summaries. Refund controls are inside expanded transaction details.
- Quick booking retains the store route and preselects only a customer verified against that store's customer list. Existing booking action validation remains in place.
- Financial and booking summary queries respect their read permissions. No schema, migration, legacy Booking/Transaction/Treatment or Production change.

## Verification

- TypeScript: passed.
- ESLint on all changed source/test files: passed.
- Targeted tests: 3 files / 25 tests passed (SPA profile guards, commerce and schedule isolation).
- Full Vitest: 455 files passed, 3 skipped; one existing reminder test exceeded its timeout while build ran concurrently. The entire reminder-engine file was rerun separately: all 36 tests passed. No reminder implementation change.
- Next production build (without migration script): passed; existing generated Prisma client tracing warnings remain.
- New customer-summary SQL executed read-only on the verified test project ttworfzgwejdeolegkxl: succeeded. Only summary counts returned; no data writes.
- Cloud browser connection timed out during setup. This change's interactive browser acceptance and screenshots are NOT marked passed.

## Remaining Preview checks

1. Open customer list on iPad portrait/landscape and desktop; verify compact rows and drawer scroll.
2. Open profile, save a temporary note, confirm list refresh, then restore the original note.
3. Quick booking preselects that customer and keeps the same store route.
4. Switch the three sections; expand transaction/refund history; verify existing purchase/refund forms remain accessible.

Preview only. PR remains unmerged; Production untouched.

## iPad refinement — 2026-09-11

- Compact two-column overview at tablet/desktop widths, three-row note input and a separate fixed save footer linked to the same form.
- Customer name, close control and navigation stay outside the scroll area.
- History switches between service, payment, wallet and refund records; switching returns to the top. Empty histories have clear messages.
- Available package uses are never truncated with the name. Cash/card are explicit selection buttons; changing the method clears the receipt confirmation.
- SPA new-customer form uses “負責人員”; other modules retain their existing label.
- TypeScript, changed-file ESLint and the same 25 targeted tests passed. No schema or financial server-action changes.
- Browser setup succeeded, but tab discovery/navigation repeatedly timed out. Interactive iPad acceptance and screenshots remain unverified for this refinement.

## Payment methods and screenshot review — 2026-09-11

- Added TRANSFER and DIGITAL_PAYMENT to SPA purchase, top-up, individual and group checkout. These record externally confirmed collection, without initiating bank or payment-provider transactions.
- Transfer requires a four-digit sender-account reference. Leading zeroes are preserved; changing payment method clears the reference. Receipts, sales and refund history retain the original reference; retries cannot silently change it.
- Reviewed IMG_1448–IMG_1455. Adjusted the SPA customer editor so birthday controls have a full column and personal details use the previously underused right column. Save/cancel returns to the same store's customer search. Checkout content scrolls with the expanded payment options.
- Targeted verification: four files, 61 tests passed. Changed-file ESLint, TypeScript and Next production build passed (build run directly, without the migration script). Existing Prisma tracing warnings remain. Runtime browser acceptance is not complete.
- Test project independently verified through Supabase project metadata: steamfoot-preview / ttworfzgwejdeolegkxl / db.ttworfzgwejdeolegkxl.supabase.co. Production ref qijlnhtpbintanzpxkvf is excluded.
- Three nullable transferLast4 columns were added on the test DB. A rollback-only check exposed existing payment-method constraints that reject TRANSFER.
- Prepared scripts/sql/spa-transfer-last-four.sql and updated the release reconciliation path. The script replaces SPA payment allowlists while retaining monetary/credit/refund validation in one transaction; it does not delete rows or modify legacy tables.
- Automatic approval review rejected applying those constraint replacements, including after test-project identity verification, requiring explicit authorization for this persistent schema adjustment. No alternate execution path was attempted. Payment changes remain local and have not been pushed or deployed.

### Authorized test DB rollout

- User explicitly authorized the test DB payment-constraint update and Preview rollout. Supabase project metadata again confirmed steamfoot-preview / ttworfzgwejdeolegkxl.
- Applied the prepared SPA-only constraint reconciliation successfully. No legacy tables, Production, or existing financial rows changed.
- Rollback-only verification cloned all current checks for SpaReceipt, SpaCreditSale and SpaRefund into temporary tables. TRANSFER with reference 0123 and DIGITAL_PAYMENT succeeded; malformed references and unknown payment methods failed as expected. All verification fixtures were rolled back.
- The previous approval blocker is resolved. This commit is for PR #970 Preview only; interactive browser acceptance remains separate from the passing code/build/database checks.
