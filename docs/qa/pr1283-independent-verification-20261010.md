# PR #1283 — independent synthetic verification

Verified base: `3d6c69e33bdc047cf08c58ad04b23a081e9b5c80`.
This follow-up changes only tests and local QA tooling. No application routes,
business logic, database migrations, credentials, or provider settings changed.

## Results

- Full local Vitest: **1,003 files / 9,334 tests passed**; existing 16 files /
  129 tests skipped. Runner exit 0. Existing nested `vi.mock` warning remains.
- Focused SQL/client suites: **8 files / 40 tests passed**.
- TypeScript noEmit passed (`NODE_OPTIONS=--max-old-space-size=6144`). The first
  default-memory attempt exhausted its heap; the expanded-memory run passed.
- ESLint for all changed TS/TSX/MJS and `git diff --check` passed.
- Headless Chromium 153: **12 synthetic component scenarios passed** (two
  components, six viewport sizes). No page errors or document horizontal
  overflow; visible input/select bounds remain inside the viewport. Drafts
  survive resize to the transposed dimensions and back.
- Screenshots inspected for mobile availability, iPad availability, and mobile
  and iPad staff creation; Traditional Chinese font supplied only in QA.

## New SQL-to-editor bridge

`course-staff-availability-save-database.test.ts` now mounts the actual
`CourseStaffAvailabilityEditor`, calls the actual
`saveCourseAvailabilityConfirmed` action through a synthetic fetch adapter,
executes its SQL against PGlite, and remounts the editor to read committed data.

Two scenarios verify that the exception appears without an extra client read
and survives remount. When the response is lost **after commit**, the editor
reuses the original payload/key on retry: one exception and one audit receipt
remain. Authorization, Prisma interfaces, course conflicts, and cache invalidation
are test adapters. This is not HTTP/session/RLS or real concurrent-server testing.
Node Blob/File and packaged WASM are used to initialize PGlite in jsdom.

## Visual fixture

`scripts/qa/pr1283-fixture.tsx` imports the real staff workspace and real course
availability editor plus production CSS. It is never imported by a Next route.
It provides 25 fictitious staff records with long names. Server actions,
navigation, and mutation transport are synthetic; network writes throw.

| Component | Viewports | Result |
| --- | --- | --- |
| Weekly/exception availability editor, single-date section expanded | 1366×900, 1920×1080, 1024×768, 768×1024, 390×844, 360×800 | 6 passed |
| Staff workspace with 25 records and create drawer | Same six sizes | 6 passed |

Runner: `node scripts/qa/pr1283-browser.mjs`. Optional `QA_PLAYWRIGHT_MODULE`
selects an installed Playwright package; `QA_CHROMIUM_EXECUTABLE` selects its
browser executable; `QA_FONT_CSS` supplies an installed Noto Sans TC stylesheet.
`QA_OUTPUT` defaults to `/tmp/pr1283-visual`. No production dependency added.

## Remaining boundaries

This supplements the existing isolated Preview and CI; it does not replace
authenticated Preview acceptance. Actual saved-response latency, all modified
settings entrances, full HQ/sidebar layout, real iPad/Safari/LIFF, keyboard-open
behavior, Supabase RLS/integration, and concurrent server locks remain unverified.
No claim that user-perceived saving takes zero time or that all four modules have
complete device acceptance is made.

The prior browser approval rejection for authenticated acceptance is respected.
No session was opened, no login API used, and no real customer data modified.
Keep the original PR draft; no production merge or deployment is authorized by
this QA execution request. The earlier exact-head CI/Preview evidence remains
evidence for the earlier base; new-head CI and Preview must be checked separately.
