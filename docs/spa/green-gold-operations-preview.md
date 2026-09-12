# SPA operations and plans refinement — Preview only

## Behavior
- Revenue, services and packages use green primary actions, light earth/gold borders and thin row separators. Date fields have constrained widths; services/package tables scroll within their containers. Remove duplicated date output and excessive spacing between service/package sections.
- Revenue filters: date range, method, customer name/phone, transaction kind and active/void/all. Pagination preserves filters. Service receipt names use booking item snapshots.
- Services: name, status and provider filters. Packages: name, applicable service and status filters. Empty states describe the current filters.
- `transaction.void` permits editing external payment method/transfer reference and voiding an erroneous original receipt/sale. UI hides these actions in read-only view. Actions separately authorize the active SPA store and installation.
- Edits require a reason, validate transfer last four digits, reject stale changes and refunded/voided sources, and record before/after with actor. Amounts and credit deductions cannot be overwritten through this editor.
- Voids share the existing transaction/lock-protected refund reversal implementation and add a `SpaPaymentRevision` VOID journal atomically. Existing entitlement/wallet eligibility checks apply. Repeated voids cannot reverse twice; previously refunded records cannot be relabeled as voids.
- Effective revenue excludes both original voided collections and their reversal entries, including when the two fall in different date ranges. Actual refunds remain included. Voids are queryable through the status filter with change reasons/history; no physical deletion or external bank/payment API is performed.
- Existing booking completion/history is preserved. This change does not implement reopening a completed receipt or changing a sale price.

## Database
Verified `steamfoot-preview`, ref `ttworfzgwejdeolegkxl`, before applying `scripts/sql/spa-payment-revisions.sql`. Only new SPA journal table/indexes were added; no production or legacy mutations, no migration-history rewriting. Reconciliation SQL and independent Prisma schema include the table. RLS enabled; anon/authenticated grants revoked and checked. Journal contains zero persistent test entries after verification.

## Verification
- 68 targeted tests cover purchases, checkout, staffing and revenue, including new permission, cross-store, stale edit, transfer-reference, already-refunded, duplicate-void and insufficient-wallet cases.
- TypeScript, ESLint and Prisma schema checks run locally. Schema validation uses dummy localhost URLs without connecting to a database.
- Exact ledger query executed on test DB; temporary transaction fixture proves voided original/reversal are excluded while real collection 1,500 and refund 500 remain. Fixture rolled back.
- Browser setup succeeds but CDP tab discovery/navigation times out, including one fresh-tab recovery. No successful interactive iPad or edit/void browser acceptance is claimed for this revision.
- Production, legacy data and PR merge remain outside this change.
