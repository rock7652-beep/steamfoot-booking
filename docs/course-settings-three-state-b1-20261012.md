# 課程設定三態第一批接續紀錄

2026-10-12，Asia/Taipei。使用者已確認盤點順序並要求下一步，本批完成本機施工。只處理運動／音樂「提醒管理、推薦分享、數位管家」，不帶入 SPA 立即搜尋第二批。

## 支線與修改範圍

- 支線：`fix/course-settings-three-state-20261012`。
- 最新整合base main：`9216901e1c7724a01e4e42bc8fe354fef6c0a0e6`（初始695df9e2）。
- 產品提交：`830f2418d311670c513ad21f4a2e52fa6744acef`；文件提交另以 `git log -1` 讀取。文件更新不變更已測產品程式。
- 已推送並建立唯一 Draft PR #1314：https://github.com/rock7652-beep/steamfoot-booking/pull/1314。最新遠端產品／部署head `f34fe5520e8ea4115a84d6ee6c517597d360d55b`。使用者已授權持續到正式上線前，仍不合併main。
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
| 遠端CI／隔離Preview／登入業務驗收 | 最新f34fe552：CI四job成功，完整1050檔9997項通過／16檔129項略過，Targeted171檔2210項通過；唯一Git Preview READY；登入後業務驗收待使用者操作 |
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

## 最新正式上線前狀態

最新遠端head `f34fe5520e8ea4115a84d6ee6c517597d360d55b`，PR #1314 open／Draft／mergeable。main仍9216901e。產品UI與隔離guard相較首個65f390e5完全相同，僅修舊測試mock及接續文件。

| 門檻 | 精確head結果 |
| --- | --- |
| CI run38203859192 | Changed-file ESLint、Typecheck、Targeted tests、Full Vitest baseline四job成功；不是只看workflow總綠燈 |
| 完整Vitest | 1050檔／9997項通過；16檔／129項依既有條件略過；0失敗 |
| Targeted | 171檔／2210項通過，0失敗 |
| Git Preview | dpl_DojncbgkQ9kcq4sXPgnutt3NnEVW，READY，source=git、target=Preview、SHA與f34fe552相同；此SHA只查到一個deployment |
| Build guard | 讀取早期build events確認isolated_database=true／notifications_blocked=true／migrations_skipped=true；無DB或provider環境設定變更 |
| 未登入HTTP | /hq/login200且data-dpl-id符合最新deployment；/api/auth/session200、內容null；運動panel=reminders及音樂panel=butler直連最後x-matched-path=/hq/login，未進入設定編輯器 |
| Runtime | 2026-10-12 12:18–12:33 Asia/Taipei所查最新Preview error/fatal無符合項目，未把它當已登入業務通過 |
| 其他check | Booking isolated postgres-integration依既有條件skipped；Workers Builds失敗，最新main也有同名失敗，未確認同一根因／是否required；本批不處理Cloudflare、不聲稱所有check全綠 |
| 真實互動 | 使用者已登入內建瀏覽器；工具不能接手該session。已收到音樂測試店HQ畫面截圖，三個Enabled入口呈現確認；panel／返回／草稿／其他角色與三態情境仍待驗，保持Draft |

精確Preview：https://steamfoot-booking-5z8zn0bqn-rock7652-2111s-projects.vercel.app

### 已核實的既有隔離測試設定

唯讀核對Supabase `ttworfzgwejdeolegkxl`，project名 `steamfoot-preview`、ACTIVE_HEALTHY。SQL使用READ ONLY交易，只讀Store、必要帳號狀態與三個feature grants；密碼欄位只回IS NOT NULL布林，沒有取hash／密碼、顧客或交易資料。

| 店家 | ID／slug | 現況與可用測試身份 | 預期三入口（依目前plan與grant，仍待UI實測） |
| --- | --- | --- | --- |
| 運動教室 / 測試店 | store-course-start-0918-a／course-start-0918-a | COURSE、ACTIVE／ALLIANCE、未封存；2個ACTIVE OWNER membership，其中1個isOwner=true；另有1個ACTIVE STAFF，已設定密碼 | 提醒／推薦分享ENABLED；數位管家LOCKED，應顯示未開通且無入口 |
| 音樂教室 / 測試店 | store-lubymusic／lubymusic | COURSE、TRIAL／EXPERIENCE、未封存；1個ACTIVE OWNER且isOwner=true、已設定密碼；business.music明確ENABLED | 三個皆ENABLED；仍需原目的頁權限 |

既有 `Staging Admin` 為ACTIVE ADMIN且已設定密碼；可以使用使用者既有安全登入方式選測試店。舊文件曾說運動店封存，這次唯讀現況是未封存，沒有由本批解除封存。兩店三個feature沒有單店grant；Hidden實际登入後情境缺既有fixture，持續列待補，不修改資料庫授權來湊驗收。停用／無密碼的授課前台身份不拿來充當後台角色。

### 使用者的最小一步

以自己的既有安全登入方式打開此精確Preview的 `/hq/login`，登入 `Staging Admin` 後，在頂欄選 **運動教室 / 測試店** 或 **音樂教室 / 測試店**，開啟 `/hq/dashboard/courses?view=settings&section=notifications`；只查看三列與可用入口，不儲存設定、不更動功能授權。

也可用各店既有Owner直接由 `/hq/login?store=course-start-0918-a`、`/hq/login?store=lubymusic` 登入，再開該店 `/s/<slug>/admin/dashboard/courses?view=settings&section=notifications`。不需在聊天提供密碼；目前本機沒有browserAuth或接手使用者session的管道，登入後結果需由使用者回報或透過之後可用的安全瀏覽器接手。

使用者已明確要求：先完成不需登入的檢查，若缺安全登入方式，列網址、測試店及最小一步。此處的登入待驗是實際阻擋，不以HTTP200、合成fixture或完整CI替代。

本段為本機接續紀錄；遠端PR描述同步摘要，部署head維持f34fe552，不為文件摘要再次建立Preview。下次先核對PR最新head及本機doc差異，再接續登入驗收，避免重做前批或另開PR。

### 使用者提供的已登入音樂畫面

2026-10-12收到一張使用者截圖（畫面時鐘12:44 Asia/Taipei），不是上傳介面所顯示的整組4張。可見Preview hostname與上述5z8zn0bqn版本相同，頂欄為「音樂教室 / 測試店」、Staging Admin／總部，選取「通知與顧客經營」。

| 項目 | 截圖可確認的結果 |
| --- | --- |
| 提醒管理 | 列名、摘要與「管理」按鈕可見 |
| 推薦分享 | 列名、「已開通」摘要與「編輯」按鈕可見 |
| 數位管家 | 列名、「已開通」摘要與「管理」按鈕可見 |

此張確認音樂測試店HQ視角的三個Enabled入口呈現符合預期；不代表按鈕已點擊、panel成功讀取、關閉返回、草稿、店家Owner角色、Hidden／Locked或實體裝置已驗。沒有從截圖推定CSS viewport、zoom或44px實測尺寸。畫面含聊天與桌面，未上傳或公開整張截圖。

下一個最小操作：在音樂店點「數位管家→管理」，確認panel標題與關閉鈕正常，關閉後仍回「通知與顧客經營」。使用者可回報結果或單張截圖，不必重傳整組。接著才依序補提醒／推薦分享及運動店Locked呈現，不儲存設定。

### 使用者提供的數位管家視窗畫面

2026-10-12再收到一張使用者截圖（畫面時鐘12:46 Asia/Taipei），Preview hostname仍為5z8zn0bqn。沿前張音樂測試店操作接續，可見已開啟的設定視窗，標題「數位管家」及右上「關閉視窗」按鈕完整可見，內容顯示「流程」、「尚無流程」、「請先建立第一個流程」與新增按鈕，截圖未見載入失敗提示。

此張支持數位管家Enabled入口已能開啟並呈現空流程工作台、標題／關閉控制沒有被頁首遮住。視窗覆蓋門市頂欄，店家／角色歸屬依前張接續，沒有獨立重新核對。仍未驗按下關閉後的原分類／捲動位置、儲存／新增、其他入口、各裝置或全三態。不要求建立流程來完成入口驗收。

下一步只需使用者按「關閉視窗」，回報是否留在「通知與顧客經營」且維持原捲動位置；確認後再補下一個入口。

### 使用者提供的數位管家關閉返回畫面

同日12:46再收到接續截圖：數位管家視窗已關閉，頂欄仍為音樂教室 / 測試店及Staging Admin／總部；「通知與顧客經營」仍選取。三列及上下相鄰內容的可見位置與開啟前截圖一致，數位管家「管理」按鈕可見焦點框。

記為此音樂HQ情境的數位管家開啟→關閉→原分类返回確認，截圖亦支持可見捲動位置與入口焦點保留；沒有DOM捲動數值或鍵盤事件紀錄，不擴稱完整焦點／RWD矩陣已驗。產品及部署head不變，未儲存設定。

下一步補同頁「推薦分享→編輯」的開啟及關閉返回；不修改文案。提醒管理與運動店Locked呈現仍待驗。

### 使用者提供的推薦分享視窗畫面

2026-10-12收到接續截圖（畫面時鐘12:50 Asia/Taipei），Preview hostname仍為5z8zn0bqn。推薦分享設定視窗已開啟，標題與右上「關閉視窗」完整可見；文案欄位、系統預設標記、分享模板收合入口、儲存控制及顧客分享預覽可見。預覽內容帶入「音樂教室 / 測試店」，網址顯示同Preview的/s/lubymusic/line-entry路徑。

此張確認音樂測試店推薦分享Enabled入口能開啟既有文案工作台並呈現店家預覽；未見讀取錯誤。畫面「已儲存」是目前顯示狀態，不視為使用者本次點了儲存，也不證明寫入成功。預覽下半部超出截圖可見區域，不據此判定完整捲動或版型已通過。關閉返回、草稿及其他尺寸仍待驗。

下一步按「關閉視窗」，回報是否回到同一通知分類與原可見位置；不修改、儲存或恢復文案。

### 使用者提供的推薦分享關閉返回畫面

同日12:50收到關閉後接續截圖：推薦分享視窗已消失，頂欄仍為音樂教室 / 測試店、Staging Admin／總部；「通知與顧客經營」仍選取。提醒管理、顧客關懷、推薦分享與數位管家的可見位置和開啟前一致。

記為此音樂HQ情境的推薦分享開啟→關閉→原分類及可見位置返回確認。截圖沒有明顯入口焦點框，不宣稱已證明推薦分享焦點還原；也不推定曾修改／儲存文案或已驗dirty guard。下一步補「提醒管理→管理」的開啟與關閉返回，不切换開關或發送提醒。

### 使用者回報提醒面板讀取偏慢

使用者在同Preview的panel=reminders、panelQuery=tab%3Dcustomer回報讀取偏慢；沒有client trace或秒數，不量化改善幅度。所查Preview近30分鐘runtime logs沒有符合輸出，無法從舊版本取得分段耗時。

原始碼核實：CourseRemindersPage在判斷目前tab前，就讀取trial care、店名、50筆care logs與map；coach／manager／logs也等待這些不用的資料。顧客分頁的getCourseReminderSetting、getCourseExpiryReminderSetting及getCoursePlanReminderSettings在JSX中依序await，其readers各自保留授權與feature確認。LINE health與tab內容亦串行等待。

同一PR追加小範圍讀取修補：只載入目前tab資料；顧客七組獨立讀取Promise.all；LINE health與tab資料並行；未開通不讀tab或外部health。維持原先page／courseManager及各reader授權、不新增快取、不改儲存／通知／資料庫。OperationTiming記錄固定operation/span與毫秒數，不記顧客、店家ID、文案或憑證；後端總耗時不能當瀏覽器端到端秒數。

本機course-reminder-page-loading等5檔43項通過；包含deferred read證明並行、各tab跳過無關資料、disabled／permission拒絕及LINE health並行；TypeScript、修改檔ESLint通過。新產品檔僅courses/reminders/page.tsx，新增loading測試。新head的遠端CI與Preview須重新核對；首版f34fe552的綠燈及截圖只證明其對應範圍，不稱提醒新版速度已通過。

完成新版後，使用者只需批次文字回報提醒開啟是否改善及開啟／關閉是否正常；不要求逐张截圖。音樂管家與分享已完成的呈現／開關返回不重做。運動店、Hidden、其他角色、實體iPad/Safari及延期390px仍按既有記錄待補。
