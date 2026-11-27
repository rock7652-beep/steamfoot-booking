# 課表日期跨月同步修復

- 授權：使用者影片與「請修復」；本機修改及測試，未 push、建 PR、部署或修改正式資料。
- 分支：`fix/course-date-picker-sync-20261117`；基底 `f75578585`（origin/main）。獨立工作目錄，不修改其他任務分支。
- 入口：音樂及運動課表日期欄位；共用 `CourseWorkspace`。權限、課程讀取、交易及通知規則未修改。Cloudflare 非本機日期事件修復的依賴。

## 變更與重現

影片呈現日期改為 2026/12/02，但網址與課表仍在 11 月。原日期欄位以 `key={selectedDate}` 重建且使用 defaultValue；修復前的實際課表元件瀏覽器測試確認選日期後輸入框失焦。這是可重現的相關缺陷，尚未在影片中的實體裝置逐步操作原生彈出日曆。

改為保留同一個受控輸入框；input、change、blur 共用有效日期提交與去重，避免 React 值追蹤已更新時漏接原生輸入，以及同一日期重複讀取。空白或無效日期不導覽，離開欄位時恢復目前課表日期。沿用原有月份讀取及晚到回應隔離。

## 驗證結果

- `node node_modules/vitest/vitest.mjs run src/__tests__/course-schedule-background-refresh.test.ts src/__tests__/sports-calendar-state.test.ts`：37/37 通過。新增追蹤值先改變、input/change 去重、blur 補交、焦點與 DOM 保留、清空日期回復的案例。
- `node scripts/qa/calendar-customer-preload-browser.mjs --date-picker`：音樂、運動各驗 1366×900、1920×1080、1024×768、768×1024，8/8 通過。合成資料 HTTP 邊界，實際課表元件；驗 11 月→12 月、返回 11 月、快速 1 月→2 月及晚到回應、日期與網址／月份一致、焦點保留、無整頁水平溢出。
- 修改檔案 ESLint、`git diff --check`：通過。
- `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental false`：通過。最初因新工作目錄缺少 generated clients 而失敗；沿用既有本機產生型別後重跑成功，未連線資料庫。
- 本機圖像已檢視 iPad 橫直方向。結果與截圖：`/tmp/calendar-customer-preload-browser/results.json`、`date-picker-{music,sports}-{1366,1920,1024,768}.png`。

## 限制與交付狀態

這是本機隔離預覽與模擬視窗尺寸；未驗實體 iPad、Safari 原生日曆、登入／角色完整業務路徑或正式資料。美業由外部 calendarSource 驅動的日期導覽不包含在這次瀏覽器案例。情境 01/08/10 選測日期切換、操作連續性及空值；搜尋、交易、門市／帳號切換、設定三態與通知不屬本次變更範圍。無新增操作步驟或後台指南變更。

本機修復完成，尚未發布。


## 下一階段查核

2026-11-17 再次 fetch 核對 origin/main 仍為 `f75578585`，沒有同題開啟中的 PR。Vercel 專案為 `steamfoot-booking`（`prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`）。`vercel.json` 未停用此新分支的自動部署；`scripts/sports-shared-card-preview-scope.mjs` 尚未授權此新分支，因此不能宣稱推送後即可取得可用且已隔離的預覽。未變更部署設定或隔離允許清單，未啟動遠端建置。

本機提交與 PR 說明已整理；上傳並配置隔離預覽需先明確確認範圍。專案 release-check 要求在不能證明推送／PR 副作用在授權內時，先交付本地差異，不自行改部署設定放行。


## 已授權隔離預覽配置

使用者已同意推送、建立 PR 與配置隔離預覽；不包含合併正式站。將精確日期修復分支加入既有 Preview 閘門，保留既有測試專案連線、來源與專案檢查，禁止 migration 與預覽外發。沿用現有分支專用功能旗標，資料庫連線由既有 Preview 環境繼承並由閘門嚴格核對；不取出或複製正式資料庫密碼。此分支自動 Vercel 部署設為 false，待分支專用旗標備妥後使用明確 SHA 手動建立一次 Preview，避免推送即在不完整設定下建置。

新增配置後，課表與隔離閘門測試共 75 項通過；型別與 lint 另以最終版本核對。遠端部署結果以實際 SHA 與 Vercel 狀態為準。


## 正式驗證補正：路由參數延遲

使用者已明確同意更新正式站；PR #1582 的完整 CI 通過後合併為 `02f81403`，部署 `dpl_4oq3f5cvHdWfRdRTrmD4K6T5SxYY`。正式瀏覽器驗證發現，Next 原生 history 更新先於 useSearchParams，新月份的資料回應遇到舊參數會重新讀取原月份；原先同步更新參數的 Vite fixture 未覆蓋此情況，不能把首次發布視為已修復。

補正：音樂月份選擇立即採本地日期狀態；運動日期保留已選值，只有與目前瀏覽器網址相符的路由日期才能回寫。日期輸入保留 draft，不因過渡期的舊值復原或重複提交。既有月份請求順序檢查保留。新增延遲路由回歸案例，瀏覽器 fixture 的 date-picker 模式延遲參數快照 150ms；音樂／運動的四種尺寸共 8 組通過，日期與課表測試 39 項通過。

沿用已授權修復分支與分支隔離設定；後續新 PR、預覽及正式發布的精確結果記錄在 PR 內，以實際部署 SHA 為準。未執行正式交易或資料庫結構變更。
