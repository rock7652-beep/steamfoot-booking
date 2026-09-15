# Course Stage 1 Preview acceptance

2026-09-15: Desktop scheduling acceptance passed. Draft PR only; no production merge.

Verified code: d49c84fb9597695e06e5ab75f59cb70f3240c503.
Deployment: dpl_2DPB823MFZQZE3FxoYGB5Utb17aU, Vercel READY.
Preview: https://steamfoot-booking-git-codex-cour-7f6935-rock7652-2111s-projects.vercel.app/hq/dashboard/courses
Select 課程排課驗收店 using the test HQ account.

## Fixed during acceptance

- Switching from course to a non-course store left the course URL showing 404. Non-course requests now return to the dashboard.
- Switching into course with router.refresh left a blank layout during the module redirect. Successful HQ store switching now loads a fresh document. The course dashboard also renders the course workspace.
- Re-tested course -> steamfoot -> course -> SPA -> course on the final deployment: all main views rendered correctly.

## Real browser and database evidence

- Secure HQ login verified as Staging Admin.
- Created 2 rooms and 2 templates through the UI.
- Single session created and shown in day details.
- Weekly scheduling created 4 sessions: Sep 16, 23, 30 and Oct 7, 18:00 Taipei.
- Month navigation displayed the October session. Refresh retained data.
- Different coach in occupied room rejected with a room conflict.
- Same coach in a different room rejected with a coach conflict.
- Adjacent 19:00 session accepted after an 18:00-19:00 session.
- Batch starting Sep 9 and conflicting Sep 16 rejected completely; SQL verified zero Sep 9 rows.
- Double-click create on Sep 17 produced exactly one session, verified in UI and SQL.
- Seven total test sessions, all in the dedicated COURSE store. Two synthetic coaches; no real contact identities.
- Steamfoot booking calendar and SPA schedule rendered with existing data. These were read-only smoke checks, not a repeat of their entire booking/payment acceptance.
- Desktop viewport had no horizontal document overflow.
- Vitest: course-actions, course-scheduling, preview-external-integration-isolation (12 passed); industry-booking-route-isolation (7 passed).
- Earlier real SQL checks passed room/coach exclusion, adjacency, idempotency uniqueness, and cross-store foreign key protection.
- Build preflight verifies both DB URLs identify isolated steamfoot-preview ttworfzgwejdeolegkxl and CourseSession can be read. No credentials logged.

## Scope and release limits

This is Stage 1 staff scheduling. Points purchases, shared cards, learner bookings and attendance deductions remain later work. Mobile end-to-end acceptance and complete legacy payment/deduction regression are not claimed by this report. A production release requires its own final integration check against current main.

No production migration, merge, real customer notification or production data mutation was performed by this course task.


## Editing acceptance — 2026-09-15
Verified commit: 8f4d379bbca1ddee496974859790c83a12bdcfc6.
Preview deployment: dpl_6XHk9DfVo6qhuaLADMo13GAcce42 (READY).

- Course defaults: UI edited core-training name, duration 60→45, capacity 10→12; saved values displayed.
- Room: UI renamed room B; selector and catalog reflect new name.
- Single session: Sep 17 session moved to Sep 18 17:30–18:15, coach 2, room B, 3 points, capacity 8, custom name; UI and reload confirm persistence.
- Attempt to move that session into Sep 16 18:00 conflict rejected; form retained input and no successful update reported.
- Cancel capacity change 8→9 left saved capacity 8.
- Template editing updates defaults only; existing session snapshots are not rewritten.
- Editing requires booking.update and derives the store on the server. Transaction and room/coach conflict constraints retained.
- TypeScript noEmit passed; 12 tests passed across course-actions and course-scheduling, including edit permission, self-exclusion, conflict/no-write and invalid/foreign session cases.
- Fixtures intentionally retain edited names and the Sep 18 session for user review. User-created Sep 21 session was not edited.
- No production merge or migration. This supplements desktop scheduling acceptance; later module work and prior release limitations remain.


## Copy and navigation acceptance
Verified code 5e678e1c39b82196ded1ee6721bc78e297aa0abd, deployment dpl_FDpHmZ3p53PWswXbUeYiDyqiyZhA READY.
- Sidebar now exposes 課表排程, 課程設定, 教室管理; real UI confirmed each shows only its relevant controls.
- Copied Sep18 edited session to Sep25 16:00–16:45; retained source name, 3 points, coach2, roomB, 8 capacity. Source Sep18 17:30 remains.
- Copy form requires a new date and permits time adjustment and existing weekly repetition.
- TypeScript passed; 14 course scheduling/action tests passed, including original snapshot copying and foreign-source rejection.
- Previous compact calendar and fixed create footer remain. No production merge.

## Desktop management lists — 2026-09-15

Verified code: 27b1ef43acec0740a03671cebd21b073c2eb4b24.
Final preview deployment: dpl_6GnTRqhhHxmQ7eHfFcvGKHhoxdPT (READY).

- Course and room management use tables with name search, category/status filters, editable persisted categories, and reversible availability. Course lists also filter by default room. Staff uses a table with name/contact search, role/status filters, and existing account controls. Other modules retain their existing staff layout.
- Settings/operations/analytics hubs use row layouts. Course EXPERIENCE stores pass recognized feature gates; role/store authorization and usage quotas remain enforced. Steamfoot/SPA and paid plan policies are unchanged.
- Browser: edited synthetic course category to 團體課程, filtered, unpublished, verified absent from new scheduling choices, and restored publication. Edited synthetic room category to 團課教室, filtered, hid, verified absent from scheduling choices, and restored.
- Browser: staff search/role/status filters worked. Reactivation initially failed with a 5-second expired transaction. Fixed by resolving plan limits before acquiring the transaction connection, retaining the locked active-count check. Final deployment successfully restored the synthetic coach through the UI.
- Browser: trial cashbook opened its records table and available actions without upgrade blocking. Analytics showed 8 September sessions / 7.5 scheduled hours / 2 coaches. Settings links rendered as rows. These checks do not claim unimplemented enrollment, sales or deduction flows.
- Browser: desktop viewport 1363px had document width 1363px (no document overflow). New-course submit button remained visible and 44px high. iPad hardware/touch testing was not performed; tables provide local horizontal scrolling when needed.
- Final database verification: 9 total sessions, zero cancelled, 3 active rooms, 4 active templates, 2 active coaches. No sessions modified in this pass. Categories remain as test examples; availability restored.
- TypeScript passed; 32 tests passed across course scheduling/actions, trial feature gating and staff management RBAC/reactivation. Includes foreign-store/no-permission checks and full-capacity/no-write behavior.
- Category SQL was generated with Supabase CLI and applied ONLY to steamfoot-preview (ttworfzgwejdeolegkxl). The SQL in supabase/migrations/20260915082019_course_catalog_categories.sql requires the existing CourseRoom/CourseTemplate tables; do not run it before the original course schema. Category columns verified NOT NULL/default empty; existing course RLS retained. Production migration/release remains separate and unapproved.
- Draft PR only. No production merge, production data mutation or customer notification.

## 2026-09-15：首頁現金抽屜與原頁面操作

- Code: `59a42af61cac07e4c5944b01c3fb698c21afa810`; Preview READY: `dpl_EttCtsZqoV8ULkyns2ya6VjVNAAw`.
- 課程首頁恢復現金抽屜，營運直接顯示收支清單；既有其他模組入口不變。
- 收支新增／編輯右側面板，固定儲存按鈕、失敗保留輸入、沿用權限與關帳確認；成功 refresh 保留目前 URL。
- 課程人員基本資料直接編輯，低頻角色與權限保留進階入口；分析加入月份原地切換，設定移除重複入口。
- `tsc --noEmit` 通過；course/actions/scheduling/trial、staff RBAC、cashbook closed guard 共 43 項通過；cash drawer page state/feature gate 與 closed guard 共 23 項通過（兩組包含重複測試）。
- 瀏覽器已驗證：首頁選單與抽屜、起始金額相同隱藏差額原因／不同顯示、營運直接進入收支、新增非現金收入 1 元→同頁編輯 2 元，儲存後 URL 仍為 cashbook。
- 本次建立的測試收支 `cmu2gii6v0001kz04ism3ql44` 已精確清除，未動其他紀錄或現金抽屜。
- 限制：刪除確認框導致雲端瀏覽器連線逾時，標準恢復未成功。人員儲存、分析月份互動及 iPad 實機尚未完成本輪瀏覽器驗收，不列為已通過。首頁抽屜未實際初始化，僅驗證入口及表單互動。
- 仍為草稿 PR #1022／Preview；未合併正式站。
