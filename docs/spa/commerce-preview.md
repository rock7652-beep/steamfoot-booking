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

## Browser acceptance 2026-09-11

Authenticated SPA test manager; branch Preview 30442c4c.
- Created test package (2 uses, NT$3,000, 180 days), purchased via customer panel. Balance 2 and expiry 2027-03-09 verified.
- Top-up NT$5,000, full refund to 0; original sale retained, duplicate refund control removed. Second top-up prepared settlement test.
- Created 10:00 booking, completed with entitlement, 2→1; receipt refund restored 1→2 without extending expiry.
- Created one group with three individual services at 11:00/12:00/13:00. Rescheduled third member to 14:00; group preserved.
- First member separately settled with stored value NT$1,800 (5,000→3,200). Remaining two grouped card settlement totaled NT$2,900; first member excluded. Reload persisted completion. DB confirmed same group and one receipt per booking.
- Stored-value receipt refund restored 3,200→5,000. Refunded third member's NT$900 card receipt; second member's NT$2,000 receipt stayed completed.
- Created 15:00 cancellation fixture. Duplicate 15:00 request showed location occupied and refused final submit. Found late validation UX: fix disables progression/submit without eligible resources.
- Found new-booking availability serialized undefined array element as null; fixed client normalization. Found home links to legacy booking paths; SPA home now provides guarded SPA links and avoids legacy summary reads. Both fixes browser-verified.
- Desktop account panel screenshot: evidence/account-20260911.jpg.

Not passed: cancellation/rebooking final browser flow (native confirmation blocked browser control; replaced with inline confirmation, awaiting browser recheck), iPad-specific viewport, simultaneous multi-browser submissions, simultaneous multi-provider group. Current test store has one provider/location; group UI tested sequential times. No real money or external payment gateway used. Test financial records retained for audit; 15:00 fixture remains CONFIRMED per DB read; cancellation did not execute. Do not label whole acceptance complete.
