# 排程衝突本地驗收 — 2026-11-03

驗收目標：運動與美業的衝突日期、占用時間、整理／租借緩衝提示，在表單內可讀；衝突後保留輸入，修改時間可重新送出。

## 已驗證

- 使用目前工作區的實際 `SportsScheduleFields` 與 `ServiceReservationForm` 元件、全站 CSS，搭配隔離的模擬資料與 action ports。
- Chromium 模擬 1366×900 桌機、1024×768 與 768×1024 iPad 尺寸。
- 兩模組共六組：提示可見、無整頁水平溢出、原顧客／日期輸入保留、改至 11:00 後模擬送出成功、無瀏覽器錯誤。
- 運動衝突後沿用原 requestKey。美業重新送出保留原顧客。
- 詳見 `results.json` 與六張 PNG 截圖。
- 2026-11-03 再次執行相關單元／整合測試：12 組、173 項通過；本次所有修改的 TypeScript 檔案 ESLint 與 diff whitespace 檢查通過。
- 完整型別檢查通過，退出碼 0：`node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --incremental false --extendedDiagnostics`。加入 PostgreSQL 測試後再次通過，沿用原 `tsconfig.json`，未縮減檢查範圍；5,956 個檔案、226.97 秒，記憶體使用約 4.26 GiB。詳見 `typecheck.log`。
- 基準 commit：`3a00ca95ed3e8fbaf77ee23a68e50f63a0795a3b`，驗收對象為此 commit 加上目前工作區修改；`source-sha256.json` 固定此次已修改程式與測試檔案內容。

## 限制

此為隔離元件操作驗收，並非登入後端到端驗收；沒有資料庫、扣堂、正式預約寫入或通知，也不代表實體 iPad 驗證。

本次環境沒有提供資料庫連線或驗收帳號。既有遠端預覽未包含本地未提交修正，不能作為本次版本驗收證據。尚未 push、建立 PR、部署或正式上線。

前輪中止的型別檢查已由上述完整通過結果取代。此次只提高 Node 記憶體上限，沒有修改 TypeScript 設定或新增型別忽略。

## 重現

在專案根目錄執行 `node artifacts/schedule-conflicts-20261103/preview-server.mjs`，再執行 `node artifacts/schedule-conflicts-20261103/browser.cjs`。預覽只監聽 `127.0.0.1:5197`；所有預約 ports 都是模擬回應，不接正式資料。

登入後完整網站驗收仍需包含本次修改的隔離 Preview 與可用登入；以下新增的本地 PostgreSQL 服務整合測試不需要使用者配置帳密。

## 真實環境驗收前置查核（2026-11-03）

- Vercel connector 可唯讀存取 `steamfoot-booking` 專案及 READY Preview 部署紀錄。
- Preview 有資料庫變數設定紀錄，但未解密或下載憑證，僅憑變數存在不能確認隔離與可用性。
- 最近可讀取的 Preview 不包含本次尚未提交的修改，不能用舊版宣稱本次驗收通過。
- Managed environment readiness：已啟動，但沒有配置 secrets、runtime variables 或 outbound identities。本機必要 DB 變數未設定，既有腳本使用的 `/tmp/beauty-same-access.json` 與 `/tmp/beauty-same-login.json` 不存在（只檢查存在性，未讀取秘密）。
- GitHub actions secrets 名稱清單查詢回傳 HTTP 403 `Resource not accessible by integration`，未取得清單或任何 secret 值。此為 GitHub API 權限拒絕，非自動審批拒絕；未改用其他路徑繞過。
- 因未具備包含本次修正且資料／通知已確認隔離的環境與可用登入，尚未開始真實預約、取消、扣堂或整批寫入驗收。未建立遠端部署、未合併、未寫入正式資料。

待測案例：取消當次固定課後安排體驗；後續固定日期仍占位；固定排程列出後續衝突日期；租借與整理緩衝仍占用；整批衝突後零部分建單；修改後重試只建立一次。必須在最新修正版本、隔離門市與停發通知條件下執行。

## 無需帳密的本地 PostgreSQL 服務整合驗收

使用本機已存在的 `postgres:16-alpine` 映像，建立 `--rm` 一次性容器 `steamfoot-conflict-qa-20261103`，僅發布 `127.0.0.1:55439`。資料庫為全新 `steamfoot_conflict_test`，合成教室、顧客與課程均在容器內建立，沒有正式資料、LINE 或外部通知。

新增 `src/__tests__/schedule-conflicts-disposable.pg.test.ts`，只接受顯式指定的 loopback 專用資料庫；若資料庫已有資料表則拒絕開始，不讀取應用程式的 DATABASE_URL，也不清除既有 schema。

四項測試均通過、零跳過，結果見 `postgres-results.json`：

1. 真實 Prisma／SQL：取消當次後該時段可用，下一固定週仍拒絕。
2. 真實 PostgreSQL 交易：先寫入一筆、再觸發固定課衝突時整筆回滾，查回零殘留；改正日期後提交一筆。
3. 真實資料庫查詢：新固定系列指出未來租借衝突；多個排課日期均回報實際占用與緩衝時間。
4. 美業租借 SQL：跨午夜保留整理時間；剛好占用結束時可用；已取消及其他門市預約不誤擋。

範圍限制：直接呼叫目前版本的服務函式與 Prisma 交易，模組資格使用測試替身；美業租借查詢使用最小 BeautyAppointment 表。未執行正式遷移、真實身份授權、`createCourseSchedule` 完整 action、網頁登入、扣堂或通知；不能稱為完整網站端到端驗收，也未新增美業固定週期功能。既有 173 項回歸及六種瀏覽器元件驗收證據保留。

測試完成後停止容器；因 `--rm` 自動刪除容器及其測試資料。

新增整合測試的 ESLint 及加入測試後的全專案 TypeScript 檢查均通過。這輪本地服務整合驗收完成；登入後完整網站驗收與正式合併／部署仍未執行。

## PR 整理

修正分支 `fix/schedule-conflicts-20261103` 已套用至最新 main `59c0791bbd754e4c4f3c9da4cc9795d91be583de`，無衝突；重跑 12 組相關回歸，175 項通過。前述型別、資料庫及瀏覽器證據保留其原始基準，不視為新 head 的遠端驗收。最新 main 包含美業 booking 的其他更新，最新 head 仍須以遠端 CI 重新確認型別與全量檢查。

推送一般新分支會觸發 Vercel Preview 與 GitHub CI；已核對 `ci-migrate.mjs` 的一般 Preview 路徑會略過正式 migration。本次沒有修改部署設定。草稿 PR 不代表正式合併或已完成登入驗收。
