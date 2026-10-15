# Music customer and receipt separation (isolated Preview)

Read-only audit of `ttworfzgwejdeolegkxl` / `store-lubymusic` on 2026-10-15:

- 87 unmerged customers: 74 previously verified synthetic identities and 13 retained operational identities (10 source students, plus 3 not confirmed as whole-customer fixtures).
- 5 native CoursePurchase records, all linked to previously verified synthetic customers: 3,200 + 6,400 + 2,700 + 9,600 + 2,600 = 24,500. No CoursePurchaseRefund or CourseTrialPayment records.
- Exact purchase IDs are enumerated in music-finance-scope.ts; future purchases are not automatically discarded because their buyer has a test-like name. Trial receipts/voids follow their booking's audited session or verified synthetic-customer linkage; null-customer and unknown bookings stay operational.
- The owner's earlier confirmation of two lessons did not classify a whole customer. Three residual customer identities remain visible pending confirmation.

Customer list counts, pagination, search and CSV export use the same customer cohort. Purchase table counts/pagination, receipt summaries, trial transaction/unpaid totals, report details/KPIs/payment methods and report export apply the selected cohort before aggregating or paginating. Refunds follow original purchase IDs; trial reversals follow the original booking. The homepage uses operational receipt totals by default. Legacy transaction controls are read-only.

Source-history tuition/payments remain in the established imported-source records. They are not converted into new native receipts, so an empty operational native-receipt ledger is not a claim that source students never paid. This change does not rewrite customer balances, receipts, cashbook entries or inventory/work-order ledgers. Those separate modules are not reclassified by this course-ledger filter.

Guard: existing exact Preview branch/repository, both isolated DB URLs and store ID. Other stores and production retain existing behavior. No schema/data writes.
