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
