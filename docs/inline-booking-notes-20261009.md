# Four-module inline booking notes — local verification (2026-10-09)

## Scope and baseline

Base: `4ed1e0eeb134f894f7545c1b0246140cf0f975df` (main, #1269).
The daily booking/roster pencil now expands the selected booking's current-session note in its existing row. It does not open the full booking detail panel. Existing detail editing, customer-label editing, full-text inspection, music terms/history/payment, attendance and checkout remain separate.

The shared implementation is `src/components/admin/inline-roster-note.tsx`, used through `RosterReminders`. It retains scoped drafts, restores trigger focus, stops row click propagation, preserves normal multiline Enter, handles Escape/cancel locally, blocks duplicate submissions, keeps failed inputs, exposes conflicts for deliberate reconciliation, and renders notes as text. Controls keep 44px targets and 14px text. Cancel of a dirty draft asks before discarding it.

## Module adapters and write boundaries

| Module | Adapter/action | Existing authority retained | Only business data written |
| --- | --- | --- | --- |
| STEAM | `DayDetailPanel` → `BookingsManager` → existing `updateBookingNoteAction` | `booking.update`, writable permission, authorized booking store, writable subscription | `Booking.notes`, maximum 500 characters; existing expected-note CAS and audit |
| SPA | `SpaBookingRoster` → new `updateSpaBookingNoteAction` | `authorizedStore("booking.update")`, writable permission, active staff/store/module/subscription, explicit selected-store check, PENDING/CONFIRMED only | `SpaBooking.notes`, maximum 500 characters, exact-note/status CAS and existing transaction/audit infrastructure |
| Sports | `CourseRoster` → `saveCourseRosterNote` | Existing `courseManager("booking.update")`, store/session/booking match, non-CANCELLED status | `CourseBooking.notes`, maximum 1000 characters; optional expected-note CAS |
| Music | Same course action, music roster layout | Same existing course authority and tenant boundary | Same booking notes only; term/payment/history fields untouched |

No customer service/long-term note action is added or repurposed. SPA customer-label permissions still come from its original customer-label provider; booking-note permission is not substituted with `customer.update`. No schema, migration, scheduling, point-consumption, payment, general API authorization or deployment configuration is changed.

STEAM and course saves are guarded by owner-lifetime scope identity and per-booking request order, including A→B→A navigation, filtering away/back, and intervening detail-editor saves. Only notes are patched onto current rows. STEAM invalidates pre-save background reads; course read generations and attendance rollbacks preserve independently saved notes. SPA overlays only the returned note revision and does not promote stale service fields to a newer detail-editor CAS revision.

## Verification

- Final focused regression: **20 files / 244 tests passed**.
- ESLint: all **22 changed/new TypeScript files passed**.
- `git diff --check`: passed.
- Focused TypeScript: new shared inline editor and `booking-note-state.ts`, including their dependencies, passed using the repository TS configuration plus Next ambient types (768 MiB heap).
- Full suite attempt: 922 files passed, 16 skipped; 8,488 tests passed, 129 skipped; **6 worker-pool errors**, so this was not a full-suite pass. The six PGlite files listed below were excluded for a separate broad pass; the summary does not identify which file caused each worker error. Isolated retry of `marketing-usage-sql.test.ts` reproduced worker exit/termination failure.
- Feasible broad regression excluding those six PGlite files: **923 files passed / 16 skipped; 8,484 tests passed / 129 skipped; exit 0**.
- Full TypeScript and a source-only attempt were terminated with SIGKILL/exit 137 before diagnostics at 3072, 2048 and 1536 MiB heap settings. **Full-project typecheck is not verified.**
- Synthetic Vite UI bundle compiled using the actual roster components and mock actions. This proves compilation, not rendered-layout acceptance.
- Independent code review found a late-response ordering issue; owner-level generations and regressions were added. Follow-up review found no remaining concrete blocker within reviewed scope.

Focused tests cover all four mappings, note-only payloads, server authority and tenant checks, clear-to-null/empty semantics, long text, literal markup, repeated pencil/save, failed retry, explicit conflict handling, retained refresh drafts, filter remounts, original-row patching, Escape/focus, and preservation of detail/music/attendance behavior. Server/database integration is mocked; no real database was contacted for this change.

The PGlite exclusions are:

- `src/server/services/consultation-lead-schema.test.ts`
- `src/__tests__/course-self-booking-migration.test.ts`
- `src/__tests__/consultation-legacy-sql-adapter.test.ts`
- `src/__tests__/audit-sql-integration.test.ts`
- `src/__tests__/marketing-usage-sql.test.ts`
- `src/__tests__/consultation-legacy-import-sql.test.ts`

## UI acceptance limits / release gates

Affected surfaces are the STEAM daily-list panel, SPA daily booking records, sports roster and music roster in their existing HQ/store dashboard contexts.

Desktop 1366px/wide, iPad 1024×768 and 768×1024, 560px narrow containers, and 390px/360px phone widths remain **visually unverified**. Cloud browser tab creation failed with CDP timeouts / “Connection closed”; the alternate local preview launch failed during sandbox initialization. No screenshot, physical-device/Safari test, authenticated workflow or successful browser interaction is claimed. The private synthetic fixture is kept outside the repository; real customer screenshots are not included in source or fixtures.

Before release: complete exact-head full TypeScript, the six SQL tests in a working execution environment, and rendered/browser acceptance for the listed surfaces and sizes. A normal Next production build was not run because this project's build script starts migration logic. This work is local only: no push, pull request, merge, deployment, migration or real database write has been performed. Any later CI publication or isolated Preview requires separate authorization and deployment isolation review.
