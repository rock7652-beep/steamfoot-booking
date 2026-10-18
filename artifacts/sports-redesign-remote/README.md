# 運動模組遠端測試站驗收（2026-10-18）

測試站：[登入](https://steamfoot-booking-git-codex-spor-4df06f-rock7652-2111s-projects.vercel.app/hq/login?store=sports-live-flow)。保留 Vercel 存取保護；需使用有權存取此專案的 Vercel 帳號。

部署 `dpl_AHCH3pxRHkgxG1E9Nyv1yy2TXt6s` 已 READY，應用程式提交 `32a932c325b3f15cf778e84d3b414c245788c219`。業務核心來自已合併的 `main@3c0bf66d`（PR #1346、#1347）；額外變更僅開放指定分支的隔離 Preview。驗收腳本與證據另存於同一測試分支，沒有合併該分支。

## 結果與證據

- 18 項介面／同步檢查：`browser-checks.json` 8 項、`variants-checks.json` 10 項。
- 真實建立教學項目、堂數與點數收費、兩次購買、每週／隔週／單次／體驗／空間出租；四種教學類型均有指定學員與開放選課。
- 堂數制：出席由 10 扣至 9，取消回 10。點數制每堂扣 2 點：出席由 10 扣至 8，取消回 10。
- 最終資料庫：兩張卡帳面餘額皆 10；堂數卡仍有其他三堂 RESERVED，可用為 7，並非所有預約都已取消。點數卡無保留，可用為 10。共 2 筆購買、12 堂教學排課、1 筆出租與 7 筆預約。
- 兩次老闆獨立登入工作階段及一個會員工作階段，分別驗出席、出席後取消、會員預約與會員取消的另一端名單更新。觀察延遲約 8–12 秒；採既有 15 秒輪詢，非 WebSocket 推播。
- 各驗收階段以頁面文件標記確認沒有重新載入，操作期間未手動更新另一端。驗收為分階段接續，腳本支援 resume；不宣稱整段測試只登入一次。
- 管理購買／排課回應有明確 `success=true`；點數取消亦擷取並解碼真實業務回應。Chrome 在部分 Server Action 無法再取得 response body，因此未以捕捉回應筆數或 HTTP 200 代替驗收，另獨立核對 PostgreSQL 帳本、狀態與餘額。

資料：`session-attendance-db.json`、`point-attendance-db.json`、`database-final.json`。截圖：`observer-attended.png`、`observer-cancelled.png`、`observer-member-cancelled.png`、`member-cancelled-mobile.png`、`point-cancelled.png`。

## 遠端才發現的相容性問題

舊 `CoursePointEntry_values` 限制不允許核心既有的 `CORRECT:ATTENDED:CANCELLED:<uuid>` 紀錄，造成取消交易整筆回滾。舊限制下的業務失敗留在 `before-preview-constraint-fix.json`，不可視為通過證據。

僅在 `steamfoot-preview`（`ttworfzgwejdeolegkxl`）新增合法取消更正格式，保留原限制與正數要求；沒有以直接改卡片餘額來補帳。修正 SQL：`scripts/qa/sports-redesign/preview-cancel-entry.sql`。其後取消仍經原介面／原交易核心成功，帳本可見各一筆出席扣抵及取消更正。

**正式資料庫相容性尚未確認；正式上線前需另外審查並安排此資料庫前置變更。** 本次 SQL 僅作測試站前置修正，不會由建置腳本自動套用正式站。

## 隔離與限制

指定 Preview 分支、repo、環境與兩條 DB URL 都必須符合隔離資料庫白名單，否則在建立 Prisma client／執行建置遷移前拒絕。本機 QA 規則保留。44 項環境隔離／回歸測試、TypeScript、修改檔案 ESLint 與實際 Vercel 建置通過；記錄見 `scope-tests.log`。

測試資料皆為假店家／假學員，不複製正式顧客。測試站新增 metadata 表已啟用 RLS，Preview 外部通知保持封鎖。沒有驗證實際銀行收單或真實通知送達；本次購買為系統帳本登錄。跨裝置使用獨立 Chromium 工作階段與手機／平板尺寸模擬，未實測實體手機、iPad 或 Safari。

正式自動部署維持 `git.deploymentEnabled.main=false`；驗收後正式站仍為 `e115fd31`（PR #1344）及原部署 `dpl_H4Q7MzEyr5nWj6gcm1V1UChZN8zW`，沒有正式部署或正式資料庫寫入。Cloudflare 依既有指示略過。

驗收使用的暫時 Preview 存取連結已撤銷；未停用 Vercel 存取保護。

## 回退方式

若需撤回測試功能，先停止該 Preview 部署或撤除測試站啟用設定，不操作正式站。取消修正的帳本列已產生，因此不直接回復舊限制、不刪除帳本或改餘額；若需收窄格式，先核對依賴新格式的既有列，再提出可保留歷史帳本的相容回退。此 PR 沒有自動執行正式 migration 或回退的路徑。
