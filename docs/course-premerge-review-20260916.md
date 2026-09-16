# Course pre-merge review — 2026-09-16

Status: NOT ready to merge. No production mutations or deployment.

## Verified
- User accepted latest test-site UI; this is user acceptance, not an automated browser replay.
- 52 targeted booking, attendance correction, purchase action, access and LIFF routing tests passed on 5d852f8.
- Preview SQL found no negative card balance or holds exceeding remaining, and no cross-store booking/session references.
- Main 5eea05ce integrated into the course branch locally. Sidebar conflict resolved retaining operation-guide feature and course module type.
- Guide module type now accepts course; existing steamfoot/SPA guides are not presented as course instructions.
- Integrated TypeScript passed after regenerating main and SPA Prisma clients.
- Trial-care plans/delivery and guide catalog: 30 tests passed. The two new main-branch SPA imports have explicit module/store gates; reviewed freeze baseline updated and its test passed.

## Remaining gates
- Local Chrome and Codex browser recovered; authenticated transaction replay is complete as recorded below. The earlier CDP timeout is no longer blocking.
- Purchase → confirmation → card issuance/income and cancellation → rebooking → attendance correction/batch replay now have real browser and Preview database evidence below.
- Actual LIFF identity exchange inside LINE remains unverified. Desktop browser correctly displays the in-LINE-only guard; this does not prove a real LINE login.
- operation-guide DOM environment repaired; four files / 17 tests passed. Physical phone keyboard and LINE in-app behavior are still not verified by desktop viewport tests.
- Production read-only schema check returned no CoursePointPlan, CoursePointCard, CoursePurchase or StaffMemberLink.courseMemberEnabled. Production schema rollout must precede enabling courses; production migration allowlist is not silently expanded.
- Course DDL is split between prisma/migrations (base scheduling and points) and four supabase/migrations patches (categories, details, attendance/contacts, portal purchases). Release execution must account for both histories and order.
- Cloudflare excluded by user instruction; not marked passed.

## Passwords
21 explicitly identified staging/course/SPA demo accounts were reset and hash verification passed. Other accounts without confirmed test provenance were left unchanged after automatic approval review rejected a database-wide reset. Passwords are communicated privately, not committed here.

## Local browser follow-up — 2026-09-16 19:58 Asia/Taipei

- Synced clean worktree by fast-forward to `e93644eb6be66441001054f665a5ddb6ee60ff11`. Vercel API confirms that revision is READY at `https://steamfoot-booking-ilou5hzdo-rock7652-2111s-projects.vercel.app` and on the course branch alias.
- Local Chrome and Codex in-app browser are usable; the earlier CDP timeout did not recur. Chrome's existing member A session opens the integrated member portal and switches to coach work. This is session reuse, **not fresh-login acceptance**.
- Member A's purchase page correctly disables purchase because this isolated store has no bank settings. No purchase was submitted. Preview `CoursePurchase` count remains zero.
- Current shared card baseline is remaining 3 / reserved 3 / available 0. This differs from older evidence because existing records have changed; no historical attendance or card data was overwritten. Future-course booking correctly exposes the authorized A/B choices with neither preselected and blocks insufficient points.
- A's health page shows no records. Preview read-only query confirms A has zero records and B has one; the shared-card relationship does not expose B's health record to A.
- Coach's current-day course expands its existing roster inline, showing completed B and a correction action, with cancelled history collapsed. No historical correction was performed merely for this inspection.
- Independent headed agent-browser session opened the fixed deployment and advanced A's phone login to the password step. At 375px the login document width and viewport are both 375px. Authenticated responsive acceptance is still pending; the Chrome extension viewport override did not change its measured viewport and is not counted as a mobile pass.
- `/s/course-e2e-20260916/liff` displays the intentional desktop guard “請從 LINE 開啟此頁”. Actual LINE in-app identity exchange remains unverified; browser emulation is not a substitute.
- Installed missing local development dependencies without changing package.json or lockfile. The four operation-guide test files now run: 17 tests passed. Latest remote revision's typecheck, changed-file ESLint, targeted tests and Full Vitest baseline are successful; postgres-integration is skipped and Cloudflare remains waived, not passed.
- Read-only Preview checks: zero negative course-card balances and zero cross-store booking/session references for the test store.
- Awaiting user login in the visible in-app store-owner login page and headed Chrome member password page. Purchase → confirmation → issuance/income, new cancellation/rebooking/attendance correction/batch replay and fresh-login completion remain pending. No database writes, production changes, merge or deployment were performed in this follow-up.

### Follow-up after member login

- User completed fresh member A password login in the independent headed browser on the fixed `e93644eb` deployment. Member/coach identity switch works.
- Real member calendar document/viewport widths: 375/375, 390/390, 430/430. At 375px Saturday's right edge is 358px. Screenshot: `/private/tmp/course-real-member-375.png` (local evidence, not a public preview asset).
- User's other authenticated admin tab was the **0915 restricted manager**, not the 0916 owner. Its attempt to open 0916 settings returned 404, confirming that this cross-store access is blocked. Correct 0916 owner login remains pending; no 0915 records were modified.
- Coach opened completed B's inline roster and correction panel. At 390×430 the settled confirmation button bounds are y=374..418, fully inside the viewport. Screenshot: `/private/tmp/course-attendance-short.png`. This is reduced viewport verification, not physical keyboard verification. Initial resize measurements were stale and were not counted as a failure or pass until matched with a fresh screenshot/measurement.
- Actually submitted the **same ATTENDED status** for booking `cmu3lh6lw0001jw043mlp7jbg` through the live coach UI. Panel closed and data refreshed. Post-submit Preview SQL: status ATTENDED, card remaining 3, exactly one DEBIT entry totaling 1 point (unchanged). No historical outcome was changed. This verifies a real idempotent replay, not attendance reversal/batch completion.
- Purchase, issuance/income and new full cancellation/rebooking/correction/batch flow still require the correct store-owner session and new test fixtures. Do not mark the full acceptance complete.

## Completed transaction acceptance — 2026-09-16 20:58 Asia/Taipei

The sections above are chronological observations; the correct 0916 owner subsequently logged in. All writes below were made through real browser controls on the isolated Preview store `course-e2e-20260916` / project `ttworfzgwejdeolegkxl`. Database queries were read-only evidence. No real bank transfer, production database mutation, production deployment or merge occurred.

### Versions and fix

- Started on `e93644eb`; one course-only display defect was found: purchase income showed “未指定” despite the stored creator.
- Fixed in `25d84aa7f0cd5a5b8ac2bf0f1ffc5853a34ce838`: the course cashbook falls back to the actual creator name when no staff attribution is specified. Steamfoot/SPA rendering and accounting remain unchanged.
- Verified live after deployment: income row now displays “課程回饋驗收店長”. Fixed preview: `https://steamfoot-booking-33h0x62sp-rock7652-2111s-projects.vercel.app`, deployment `dpl_4uN59HDmjzstP29SJJsiAcSkczzM`.
- Changed-file ESLint, typecheck, targeted tests and Full Vitest baseline passed in CI. Local ESLint, typecheck (after regenerating all three Prisma clients), 35 purchase/booking/correction tests and the earlier 17 operation-guide tests passed. Initial local type errors were stale generated clients, resolved by generation without any migration.
- `postgres-integration` remains skipped. Cloudflare failed but is explicitly waived; neither is reported as passed.

### Purchase, confirmation, issuance and accounting

1. Owner set previously empty bank fields to explicit non-bank fixtures: “隔離驗收銀行（測試用，請勿匯款）”, code `TEST`, account `TEST-0916-NOT-A-BANK-ACCOUNT`. Existing shop name/address/rules were preserved.
2. A purchased the existing 10-point / NT$1,000 plan through the member portal, submitting test last-five `09166`. UI displayed pending confirmation, and order `cmu436wd50000l604k7md0vma` was PENDING with no card.
3. Owner confirmed through the pending-order UI. Exactly one card `cmu437xd20002l6044ccyhp62`, one GRANT of 10, and one OTHER income row `course-purchase:cmu436wd50000l604k7md0vma` for NT$1,000 were created. Order became CONFIRMED. Expiry: 2026-12-15 Taipei.
4. Member purchase history displayed activated status. Owner added B to this new card via the common-card UI.
5. Cashbook and home both show cash income 250 + non-cash income 1,000 = 1,250. Existing closed drawer actual balance and next opening baseline remained 1,250 with zero difference; purchase did not mutate the closed cash snapshot.

### Booking, cancellation, check-in, correction and batch replay

- Created a new 2026-09-16 20:50–21:20 course through the scheduling UI, capacity 2, cost 3/person, coach A, existing room/template. Session: `cmu43abc20004l604a0pr6aif`. No old session was edited.
- A selected only B on the new card. The first booking held 3 points while remaining stayed 10. Backend displayed B as attendee, A as operator, actual card/expiry, existing customer service note and new booking note.
- Cancel confirmation named B. Cancellation created matching RESERVE/RELEASE 3 entries. Rebooked B; added A to test grouping; cancelled only A, leaving B active and remaining 10 / held 3 / available 7.
- Rebooked A solely for batch acceptance. All cancelled records are retained.
- Owner checked B in: status RESERVED with checkedInAt populated, remaining 10, zero debit entries. Attempted early completion was rejected with “課程尚未開始，不能點名扣點”. Waited for the actual start time; no clock or business-rule bypass.
- Coach marked B attended: remaining 7, held 3 for A. Corrected B to NO_SHOW: remaining returned to 10, held 3 for A. This applied the existing no-show rule without a fee.
- Selected A and B together for attendance: both ATTENDED, remaining 4, held 0. Resubmitted both as ATTENDED: remaining 4 and entry count 11 unchanged. The correction history is retained. Active completed bookings: B `cmu43dfxw000cl604a071tfyr`, A `cmu43ggzz000ml604z7e6pb65`.
- Member plan page showed 4 available / 0 held on the new card, separate from the original card. Coach showed completion. Analytics: 7 scheduled classes, 2 unique learners, 6 participation visits, 5 completed visits, 0 no-shows, 13 completed points and NT$1,250 income. These include existing records plus this run; they are not counts of new fixtures only.

### Concurrent real-browser checks

- Prepared two authenticated member tabs at the confirmation step and sent both clicks using Promise.allSettled. Same Sep18 class, different attendees A/B, capacity 1: A succeeded; B received “本堂課已滿班”, retaining B and the note. No second active booking.
- Cancelled only the new winning reservation, restoring the card's 4 available points.
- Prepared Sep18/A and Sep19/B confirmations against the same 4 available points (3 each), then submitted concurrently. B succeeded; A received “方案可用點數不足”, retaining A and the note. SQL confirmed one reservation / held 3 / remaining 4, no partial second hold.
- Cancelled the new successful race reservation through the UI, retaining its history. Final new card remaining 4 / held 0; original card remains 3 / held 3. No original reservation was cancelled or changed.
- Final SQL: one purchase, one purchase-issued card, one purchase income row; zero overbooked classes and zero negative balances or holds exceeding remaining.

### Remaining limits and handoff

- Actual LINE in-app login and physical device keyboard remain unverified. Fresh browser password login, member/coach switch, 375/390/430px member calendar and coach roster, and shortened confirmation panel were verified separately above.
- Purchase confirmation idempotency is covered by action tests and one-order/one-card/one-income SQL evidence; this run did not replay an identical purchase confirmation HTTP request. Attendance idempotency was replayed through the real UI.
- Shared cashbook change is limited to a course-only display fallback. Full CI passes; this run did not replay the entire steamfoot/SPA write lifecycle.
- Production course schema rollout and its two migration histories remain deployment prerequisites, as listed above. No production migration authorization is implied.
- Preserve the new purchase, card, completed class and all cancelled test history for user review. Wait for explicit user acceptance and merge authorization.
