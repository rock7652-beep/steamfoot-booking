# SPA operations and plans — Preview only

## Changes

- SPA revenue routes now use an isolated receipt/sale/refund ledger; the legacy revenue branch remains unchanged for non-SPA stores. All ledger sources and customer joins are store scoped, with transaction-read permission checked at the page and a SPA store guard in the query.
- Receipts paid externally, package purchases and top-ups count as collected funds. External refunds reduce net collection. Entitlement/stored-value usage and restoration appear in the ledger without being counted again as incoming/outgoing external money.
- Today/week/month links, a custom date range and payment filter share one ledger with stable ordering and 30-row pagination. Transfer references and customer search links appear on each applicable row. Completed-service counts use receipt timestamps and are independent of the payment filter.
- Service management now creates new isolated SPA services and their direct provider/location relations in the existing transaction and store-lock path. Prices use integer TWD, matching the database. Existing booking snapshots remain intact.
- Package management uses a compact table, active/inactive/all filtering and a copy action. Copies start unpublished and saving selects the corresponding status filter so they remain visible. Existing purchased entitlements are unchanged.
- Purchase payment controls appear after selecting a package, with an explicit amount due. Existing transfer reference validation and refund behavior are retained.

## Verification

- Targeted tests: 4 files / 59 tests passed, including new service creation, cross-store rejection and revenue store/date/filter scoping.
- Exact generated ledger SQL executed read-only on the verified test project ttworfzgwejdeolegkxl; PostgreSQL accepted both the total and paginated customer-joined queries.
- The real aggregation expression was tested against 8 synthetic rows in a read-only CTE: collection 10,200, external refunds 500, net 9,700. Stored-value usage, entitlement usage and credit restoration did not inflate collection/refunds.
- No database schema change or financial data mutation for this iteration.
- Local compilation succeeded; a missing customer projection type was found by the build check and corrected before submission. Final TypeScript and changed-file ESLint passed; Preview deployment is verified during rollout.
- Interactive iPad/browser acceptance is not yet recorded for this iteration. No Production changes or PR merge.
