# Music catalog and tuition workflow — 2026-09-28

Base: production merge 38d745a1. Branch: codex/music-catalog-20260928.

## Implemented locally
- Music catalog class filters (private, self-organized, group, trial), category/name sorting within existing visibility ordering.
- Direct course-to-plan navigation with template filter; new plans inherit the selected course and use course-specific draft keys.
- Plan search includes associated course names and categories.
- Flexible 1–1000 lesson term counts across form, validation, and a forward database migration; existing price/expiry/mode checks remain.
- Trial catalog rows show one trial lesson and free/paid amount.

## Verification
- 23 product/scheduling tests passed; changed-file ESLint passed.
- TypeScript checked separately.
- Database migration not applied. Browser acceptance and preview deployment pending.

## Remaining authorized scope
- Store-configurable promotions and manual bonus lessons, stored separately from paid lessons.
- Enrollment snapshots so changing plan definitions cannot change historical term boundaries.
- Group midterm enrollment: include first selected class, remaining lessons times standard unit price, optional discount.
- Payment form integration and old-student renewal discount; keep existing purchased prices.
- Subsequent rounds: per-term payments/receipts and student history. Room rentals deferred by user.

## Release order
Apply flexible lesson count migration before exposing new counts. No production writes or deployment performed in this branch.
Rollback application first; retain the expanded check constraint because new legitimate counts may already exist. Do not restore the old constraint without auditing those rows.

## Second implementation checkpoint
- Added immutable paid-period arrays and separate promotional/manual bonus counts to purchases and cards.
- Store-scoped plan bonus configuration; backend recomputes tuition and ignores submitted counts.
- Shared music checkout supports optional single-period group midterm selection, inclusive remaining lessons, existing discounts and manual bonus permission.
- Frozen period and bonus display in roster; card template snapshots used for renewals.
- Preview Supabase ttworfzgwejdeolegkxl: both migrations applied and 12 legacy music plans initialized. Production untouched.
- Legacy initialization preserves the period layout inferable at migration time; it cannot reconstruct previously overwritten configuration.
- 55 product/checkout/roster/correction tests passed; TypeScript passed. Browser acceptance pending deployment.
- Midterm purchase creates entitlement; scheduling remains a separate existing operation. No existing enrollment is silently moved to the new purchase.
