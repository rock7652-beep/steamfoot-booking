# SPA commerce Preview integration

Scope: PR #970, Preview only, verified Supabase project ttworfzgwejdeolegkxl. No Production deployment or legacy Booking/Transaction/Treatment mutations.

## Workflow
- Plans: service definitions remain available; SPA packages specify one service, price, uses and validity. Existing purchased holdings retain snapshots after template edits.
- Customers: account panel records cash/card package purchases or stored-value top-ups, displays entitlements, balance, receipts and ledger.
- Completion: single booking accepts cash, card, eligible entitlement or stored value.
- Refunds: full original sale/receipt only, independent refund record and original receipt retained. Stored value returns to wallet; entitlement uses return without extending expiry. Used/reserved packages cannot be fully refunded; top-up refund requires sufficient current balance. Cash/card actions record a refund performed separately; no payment gateway is invoked.
- Groups: 2–3 guests with one primary contact, individual services/staff/locations. Creation shares one transaction. Per-person checkout supports all methods; remaining group checkout accepts one cash/card method and requires all unpaid members, including rescheduled members on another date. Each guest retains an individual receipt.

## Verification
- 66 targeted tests passed across commerce, checkout/credit, booking, SPA isolation and provider eligibility.
- TypeScript and targeted ESLint passed.
- scripts/test-spa-commerce.sql passed against verified test DB: sale/refund uniqueness, balance rollback, refund source check and group request rollback. Entire SQL transaction rolled back.
- Additive scripts/spa-commerce-schema.sql applied only to verified test DB. Four new tables have RLS and no anon/authenticated grants. Security advisor reports informational missing policies (intentionally server-only); pre-existing public btree_gist warning remains.
- Browser acceptance is pending authenticated access to the new deployment; automated tests are not a substitute for browser acceptance. Real simultaneous browser submissions and iPad visual acceptance must not be marked passed without evidence.

Limits: no partial monetary refunds, no arbitrary split of one guest's amount, no online payment processing. Production migration needs its own history/schema reconciliation review; this SQL is not authorization to run production deploy migrations.
