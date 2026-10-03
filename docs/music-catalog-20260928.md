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

## Subject / plan separation follow-up

- Added a music-only subject catalogue (name, category, active status, optional description). No scheduling time or tuition fields in this editor.
- Plan editor owns class type, per-lesson tuition, term size, term count, validity and gifts. Creates/reuses a rule template under the subject; never rewrites historic rule templates.
- Existing templates are backfilled one-to-one without guessing instrument names or merging records. Existing purchases, bookings, qualifications and attendance references remain intact.
- Scheduling selects subject and rule variant; time, room, teacher and capacity are scheduled separately. New rule variants still require the normal teacher qualification setup.
- Subjects have same-store foreign keys, RLS enabled (no browser Data API policies), and server permission checks. Deactivation prevents new usage while retaining history.
- Preview-only migration: `20260928140000_music_subject_catalog`. Production has not been changed. Rollback app to the previous preview and retain the additive schema/data; do not delete user-created subjects or templates.
- Local checks: 51 purchase/term/subject tests plus 17 booking/reschedule tests passed; TypeScript and targeted ESLint passed. Browser acceptance pending deployment.

## Management interface follow-up (ten agreed items)

- Shared batch status UI on subjects, plans, rooms and staff. Each item commits independently; failed IDs and reasons remain selected. Filtering clears selection, and stale filter callbacks do not restore hidden selections.
- Status controls lock only affected items. Successful rows update locally; background refresh retains current filters and scroll. Pending status overrides survive older server responses until acknowledged.
- Compact plan/header spacing, consistent room separators, readable inactive rows, optional test-data filter (no deletion or renaming).
- Plan name/status share a row; “包含期數” wording; gift/cost/schedule rules share one advanced section. Room equipment/location share a row, short notes, common save label. Subject editor warns before discarding unsaved input and retains failed inputs; existing room/plan/staff guards retained.
- Music labels use 老師. Repeated emergency-contact and login reminders removed from roster rows, details remain available.
- Music rooms no longer expose or enforce historical capacity; fitness room capacity checks retained. Music room deactivation keeps scheduled sessions. Deactivation controls first show the count of unfinished sessions.
- Music manager enrollment can explicitly confirm adding to a full class, including trial learners. Public class capacity is not raised. Member booking rejects injected overrides. Duplicate enrollment, student timetable overlap, card validity/balance, store permissions and resource conflicts remain checked.
- Preview personnel warning investigated read-only: store-lubymusic has 11 active staff and EXPERIENCE/TRIAL, maxStaffOverride=null; trial limit remains 3. No billing/entitlement/production configuration changed. Already-active staff status is idempotent even above legacy limits.
- Verification: 107 targeted booking, resource, batch, staff, term, checkout and reschedule tests pass; TypeScript and changed-file ESLint pass. Browser verification follows this preview deployment.
- This follow-up needs no additional migration. Requires prior subject migration from this branch. Production not merged.

### Preview browser verification, 2026-09-28
- Build correction: initial deployment 2db186f failed because new action error helpers inferred an impossible success variant. Explicit failure returns fixed the TypeScript errors; ad7e395 deployment is READY. Full local TypeScript exited 0; 56 affected booking/batch tests rerun successfully.
- Browser verified subject batch down/up, search clearing selected rows, room batch deactivate/reactivate, two-plan batch down/up, and idempotent activation of the current already-active manager. All test statuses restored.
- Room creation no longer shows capacity. Cancelling the unsaved-close confirmation retains the input. Plan editor shows name/status together, lesson/term fields and one advanced section; save remains visible on desktop.
- 768px tablet preview exposed excess plan-table width; music unit price and validity moved below price and lesson count, reducing seven columns to five.
- Full 15-person future class retains add-student/trial controls. Existing QA student insertion triggers over-capacity confirmation. Submission is blocked by EXPERIENCE/TRIAL monthly booking quota; inputs are retained. This end-to-end enrollment check is NOT passed. No plan entitlement bypass or actual payment was performed. Unit tests cover manager-only over-capacity, public rejection, duplicates and overlaps.
- Preview counts after attempted enrollment unchanged: purchases 3, cards 105, bookings 372. Production untouched.
