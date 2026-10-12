# 課程設定三態第一批接續紀錄

2026-10-12，Asia/Taipei。使用者已確認盤點順序並要求下一步，本批完成本機施工。只處理運動／音樂「提醒管理、推薦分享、數位管家」，不帶入 SPA 立即搜尋第二批。

## 支線與修改範圍

- 支線：`fix/course-settings-three-state-20261012`。
- base main：`695df9e22c2e5cba66f061b78a55df37e884b89d`。
- 產品提交：`830f2418d311670c513ad21f4a2e52fa6744acef`；文件提交另以 `git log -1` 讀取。文件更新不變更已測產品程式。
- 已推送並建立唯一 Draft PR #1314：https://github.com/rock7652-beep/steamfoot-booking/pull/1314。使用者已授權持續到正式上線前，仍不合併main。
- `src/app/(dashboard)/dashboard/courses/settings-workspace.tsx`：沿用 FeatureEntry 與 layout 的 FeaturePresentationProvider，三個入口呈現 Hidden／Locked／Enabled；空狀態計入可見 Locked 列；client 直連 panel 受功能及目的頁權限阻擋。
- `src/app/(dashboard)/dashboard/courses/shared-hub.tsx`：三個 can props 僅表示既有目的頁權限與唯讀限制；既有 hasStoreFeature 改用於直接 panel 內容守門，未開通、無權限或唯讀不渲染其 server 內容。提醒沿用已查出的 business_hours.manage 結果；推薦分享／管家仍用 plans.edit。
- 3個測試檔：新增 server 權限／panel 內容測試，workspace 加入兩店型／HQ與店家prefix／三態／混合狀態／權限撤回／直連測試；既有hub斷言更新為權限與功能呈現分開。
- 2個 `scripts/qa/course-settings-three-state-*`：可重跑的合成瀏覽器 fixture，使用真實 workspace、FeatureEntry、SettingsListRow、CourseSettingsPanel；後端匯入替換為禁止呼叫的stub，Playwright網路攔截，沒有登入或資料讀寫。

沒有改共用 FeatureEntry、後端 actions、權限矩陣、DB/schema、扣堂、退款、名額或老師／位置衝突規則。原目的頁及寫入端授權保持。readonly及既有不開放的設定頁角色不擴權。

## 測試結果

| 檢查 | 結果與證據 |
| --- | --- |
| Vitest | 13檔／183項通過，0失敗；包含新server與三態測試、設定hub/panel/permissions，以及#1299名單／排序／返回、#1308備註、#1312頁首定位回歸 |
| ESLint | 2個產品檔、3個測試檔及2個合成fixture檔通過 |
| TypeScript | 最終 `npx tsc --noEmit --incremental false` 通過（包含fixture與測試型別修正） |
| Chromium合成 | 運動／音樂 × HIDDEN/LOCKED/ENABLED × 1366×900、1440×900、1024×768、768×1024、767×1024、560×768，共36組通過；无整頁水平溢出、Enabled3個入口至少44px、Locked不混入空狀態、Hidden無三入口 |
| 草稿與撤回 | 合成panel草稿改尺寸保留；Locked撤回後editor卸載；jsdom另覆蓋個別权限撤回與Blocked直連；不等於真實網路權限撤回端到端 |
| 全量Vitest／正式build | 未做；本批只跑相關回歸。未呼叫會包含migrations/preflight的package build |
| 遠端CI／隔離Preview／登入業務驗收 | 未做；尚未推送或部署 |
| 真實iPad／Safari／延期390px | 未做，持續待補；本批560窄版合成結果不代替390px延期驗收 |

Vitest命令：

```sh
npx vitest run src/__tests__/course-settings-feature-access.test.ts src/__tests__/course-settings-workspace-ui.test.ts src/__tests__/course-settings-hub.test.ts src/__tests__/course-settings-panel.test.ts src/__tests__/course-settings-permissions.test.ts src/__tests__/settings-nested-feature-presentation.test.ts src/__tests__/feature-presentation.test.ts src/__tests__/course-display-order.test.ts src/__tests__/course-display-order-ui.test.ts src/__tests__/operation-return-position.test.ts src/__tests__/course-roster-operation-feedback.test.ts src/__tests__/customer-note-pending-preview.test.ts src/__tests__/spa-customer-header-offset.test.ts
node scripts/qa/course-settings-three-state-browser.mjs
```

合成結果：`/tmp/course-settings-three-state-qa/results.json`，截圖同目錄 sports-/music-各寬度png。已人工查看768直向與560窄版Locked截图。此目錄為本機暫存，fixture腳本可重建。

首輪新增server測試13項因fixture漏subscriptions=[]失敗；只修fixture後13檔183項乾淨通過。首輪lint一項children-prop寫法已修正；最終型別檢查發現createElement的provider必填children型別，改以完整providerProps傳入後再次驗證。合成bundle兩次依賴stub解析失敗已修正，最後36組通過。Chromium sandbox啟動曾受socket Operation not permitted限制；透過允許的本機執行權限後完成，沒有改環境安全設定或網路政策。

React best-practices查核：沿用共用骨架與provider；hooks固定順序、boolean直接派生；無新增讀取或跨店cache；僅可使用狀態挂editor；不改字級／版型；前後端權限與可見狀態分開。Next16 server/client guide及Framework40/41已查核，server內容在建立element前守門，避免只靠client隱藏。

## 阻擋與下一步

使用者已追加授權「允許，直到可正式上線前」：可推送此支線、建立一個Draft PR及完成隔離Preview。正式合併、DB寫入／DDL、重設或新增帳號及安全設定變更不在授權內。Preview只將此支線加入既有精確分支隔離白名單，沿用既有隔離DB、通知封鎖與migrations skipped守門。

發布前整合main `9216901e1c7724a01e4e42bc8fe354fef6c0a0e6`；保留新增課程／教師設定與完整vercel.json。`scripts/consultation-preview-scope.mjs` 新增 `COURSE_SETTINGS_THREE_STATE_PREVIEW_BRANCH` 常數，加入既有兩處module-roster guard，沒有新的放寬路徑。新增 `course-settings-three-state-preview-isolation.test.ts` 覆蓋精確repo／branch／provider／DB目標、runtime test旗標不得繞過、通知封鎖、build在DB constructor及migration subprocess前結束。vercel.json與最新main相同，使用既有Git自動Preview，不另開重複部署。

接續先讀本紀錄並核對最新main／open PR及本機支線head。#1310範圍為顧客／結帳，latest已更新637552bfe7a78257a182c2174d07a1327a5a40d0；#1307指南及#1245音樂期初另案，沒有同需求課程三態PR。#1299/#1306/#1308/#1312只當回歸，不重做或重開發布。

登入隔離Preview需驗：運動／音樂三個入口的每店HQ三態、目的頁權限、唯讀、直連panel、撤回後不能寫入、panel關閉與草稿、桌機與iPad CSS尺寸。沒有該入口的既有虛構fixture時記錄待補，不改真實店資料開功能來驗收。

## 遠端檢查點 2026年10月12日

首個遠端head `65f390e567eebff71a9a8a701c556c5be1ec748f`：已整合main9216901e，本機20檔282項、型別與lint通過；最新整合程式再次Chromium合成36組通過。隔離guard首輪測試因sandbox禁止spawnSync出現EPERM，允許本機子process後原測試乾淨通過；没有放寬產品防線。

- 唯一Git Preview `dpl_7vYNUxoZmuuz2hqqdGcvvYkjZSur`，READY；exact URL https://steamfoot-booking-fntu9tl7h-rock7652-2111s-projects.vercel.app；project prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR、team team_IAPnhzLHM4x540wiXg3lTyS9、source git、target Preview、SHA與head相同。build明列isolated_database=true／notifications_blocked=true／migrations_skipped=true。
- CI run38203574868：Changed-file ESLint與Typecheck通過；Targeted171檔中170檔2199項通過、1檔11項失敗。`course-self-booking-settings-ui.test.ts` 的舊feature-presentation全模組mock漏了useFeaturePresentation，現已移除不必要的mock，保留真正共用元件，屬test-only修正。Full Vitest當時仍執行中，不能宣稱此head全綠。
- Vercel已授權HTTP fetch：/hq/login 200且data-dpl-id符合本deployment；未登入直連/hq/dashboard/courses?view=settings&section=notifications&panel=butler跟隨導向後200，x-matched-path=/hq/login，沒有編輯器。不以此替代已登入角色／三態驗收。
- 檢查當時Preview error/fatal runtime logs沒有符合項目；只代表所查時間窗，不保證已驗整個業務。
- 登入後驗收等待既有隔離運動／音樂測試店與安全登入管道。本工具沒有browserAuth或既有session，不搜取密碼、不建立／重設帳號、不偽造session。已向使用者詢問安全管道，繼續完成CI與其他可做查核。

下一個head包含舊測試mock修正與此接續記錄，產品UI及隔離guard不變；只更新同一PR，由Git自動Preview，精確新head的CI與READY須另核對，不能沿用首head結果。
