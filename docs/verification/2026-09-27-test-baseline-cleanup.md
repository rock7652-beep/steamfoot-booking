# Test baseline cleanup — 2026-09-27

Reviewed against main `64961059635f71ab27a776a0d4dbb61eea8e02b3`.

## Findings

The 13 failing tests were test maintenance defects, not demonstrated production defects. No application behavior, schema, permissions or interface changes are included.

| Failures | Cause | Resolution |
| --- | --- | --- |
| 1 business-hours store scope | Mock day context omitted required `slotOverrides`; real resolver always supplies an array. | Supply the complete context and retain booked-person/store/write assertions. |
| 9 reports entitlement | New authoritative industry lookup was not mocked, causing page unit tests to attempt a real database connection. | Mock the module lookup, keep existing report assertions, and test SPA/course routing before legacy queries. |
| 1 course trial collection | Test asserted the old `!paid &&` source syntax and indentation; current UI uses a paid/unpaid conditional branch. | Replace the source-string case with rendered interaction tests for unpaid collection, paid correction, permission denial and disabled trial actions. |
| 1 course customer search | Test expected removal of LINE search despite current server support for name, phone and LINE name. | Align the prompt contract with supported search fields, retaining compact customer-action assertions. |
| 1 SPA shared import freeze | Two previously shipped shared entry points were absent from the reviewed boundary list. | Review and explicitly list reports routing and LIFF consumption, with module/store/customer boundary tests. The exact-list guard still rejects additional unreviewed imports. |

## Boundary review

- Shared reports look up the authoritative viewed-store industry before invoking legacy metrics. SPA renders its own adapter; Course redirects with the selected period. SPA query service also requires a SPA store and filters reads by store.
- LIFF consumption intentionally combines shared transactions/cashbook income with SPA sales/receipts only for SPA stores. Each read is constrained by the resolved store and customer (including the receipt booking relation). Added tests cover Steamfoot/Course exclusion from SPA reads, SPA identity resolution, missing context, wrong role, and resolution errors.
- Collection interaction tests assert the selected booking and original receipt passed to the corresponding modal, not only that button text exists.

No skipped test or production database write was added for this cleanup. Existing skipped tests remain outside this run's executed coverage.

## Local validation

- Full Vitest suite: 665 files passed, 9 skipped; 5,758 tests passed, 62 skipped, zero failures.
- TypeScript `tsc --noEmit`: pass.
- ESLint across all changed/new TypeScript files: pass.
- `git diff --check`: pass.
