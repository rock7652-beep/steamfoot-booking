# 四模組名單標籤／備註一致性：待 Preview 驗收

本輪只調整預約／上課名單的標籤與備註呈現。已建立隔離 Preview（最新結果見文末），未合併正式站、未修改任何店家設定或真實資料。

## 入口與資料對應

| 模組 | 入口／元件 | 標籤 | 平時／店內備註 | 本次備註 | 保留的模組資訊 |
| --- | --- | --- | --- | --- | --- |
| 蒸足 | 預約管理 → 當日預約；DayDetailPanel | customer.id 既有 CustomerLabels | customer.serviceNote，顯示「平時」 | booking.notes | 到店／完成人數、方案與堂數、實扣方案、收款、所屬店長 |
| SPA | spa-schedule → 當日預約紀錄；SpaBookingRoster | booking.customerId 既有 CustomerLabels | 既有同店 customer.serviceNote，只讀映射，須原有 customer.read | SpaBooking.notes | 時間、服務、人員、位置、狀態與原始收款／退款摘要 |
| 運動 | 課程 → 上課名單；SportsRosterReminders | booking.customerId | booking.serviceNote | booking.notes | 原 #1258 容器斷點、所屬店長折行、點數、課後剩餘、詳情與代理來源 |
| 音樂 | 課程 → 上課名單；RosterReminders | booking.customerId | booking.serviceNote | booking.notes | 期數、下期已繳、請假／曠課、各期日期、補課日期、付款歷史與原有權限 |

- 四模組共用 src/components/admin/roster-reminders.tsx 及 CSS module。
- 第一行為標籤摘要；第二行為本次及平時／店內備註，各來源分開截斷。
- 摘要維持 14px、兩行 20px＋4px 間隔；摘要、標籤與筆記入口有各自 44px 操作區。
- 完整備註可透過摘要開啟，保留換行與全部內容；空／唯讀／取消情況保留一致欄位空間。
- 蒸足與 SPA 使用實際容器寬度斷點；窄容器拆行，不縮小文字。音樂不強制將期數與付款內容壓成運動的一列。
- 運動與音樂沿用既有編輯本次備註流程；蒸足與 SPA 的筆記入口開啟既有預約編輯介面，不新增寫入端點。
- 標籤仍由 CustomerLabelsProvider 與原有後端授權控管，本輪不變更授權、加購、扣堂、缺課或資料模型。

## 本機初驗

- 原始參考截圖已查看；未納入 repository、fixtures 或此文件。
- 9 個 focused suites，110 tests passed：四模組共用 cell、既有運動、蒸足當日列與批次流程、SPA 歷史摘要、音樂日期／付款／缺課顯示，以及 exact Preview guard。
- 合成資料 Vite bundle build 通過。這只證明元件可編譯，不能視為視覺驗收。
- changed-file ESLint 通過；git diff --check 通過。

## 本機限制與待驗項目

- 全量 Vitest 啟動後遭 OS exit 137；沒有完整 suite 結果，不能算通過。
- 全量 TypeScript 檢查遭 OS exit 137；不能算通過，待遠端 CI。
- 雲端 Chromium 新分頁出現 Target crashed，文件建議的正常恢復也逾時；本輪沒有取得可用最終畫面或瀏覽器尺寸量測。
- 1366px、寬螢幕、1024×768、768×1024、560px 窄容器、390／360px，sticky header、水平溢出與真實資料編輯往返均待 Preview 驗收。
- 未驗真 iPad／Safari；單元測試只證明 DOM 及 callback／焦點回復行為。

## 最小 Preview 發布範圍（已獲授權，正式合併除外）

1. 僅 push 本支線 fix/unify-module-notes-density，開 draft PR。
2. Preview exact branch／repository／Vercel metadata 檢查，DATABASE_URL、DIRECT_URL 兩者都必須指向既有隔離測試資料庫。
3. build 明確跳過所有 migration 與 seed；既有 Preview 外發通知抑制持續啟用。
4. vercel.json 仍將此支線 deploymentEnabled 設為 false，Git 自動部署未啟用。
5. 僅建立已授權精確支線的 Preview，使用既有隔離測試門市與合成資料。無 schema 變更、無正式資料存取、無店家設定異動。
6. 遠端 CI 完成 TypeScript 與相關回歸後，逐模組補齊桌機／iPad／手機與取消／返回驗收，呈交結果；正式合併另需明確授權。

## 隔離 Preview 與遠端 CI 更新

已依明確批准公開原倉庫 Draft PR #1260（仍不合併正式站）。首個遠端 UI 版本 e0320f84046d50c704fc9aac3368606db2ab6c62：

- Preview deployment dpl_HA67q8eGvZRnKePhjgumPacJfZhq 已 READY；target 為 Preview，對應精確 branch／commit。
- build log 已確認 isolated_database=true、notifications_blocked=true、migrations_skipped=true。未新增或複製環境憑證，沿用既有 Preview 設定。
- 遠端 Typecheck、changed-file ESLint 通過。
- Full Vitest：899 suites／8,123 tests passed，16 suites／129 tests 為既有 skipped。
- Targeted job：1,382 passed／2 failed；失敗為既有指南外發隔離測試的 Next request-cache／console AsyncLocalStorage 初始化順序，與產品執行碼無關。採用已驗證的同檔 test-only 修正，保持實際 sender、fetch、DB 與隔離斷言；重跑 CI 後再確認通過。
- 雲端瀏覽器已恢復可用；新隔離網域需安全登入，四模組最終 UI 驗收仍在進行。

Git 自動部署仍 disabled；隔離 Preview 由明確 Git deployment 啟動，沒有啟用正式發佈。


## 待發新版：SPA 標籤權限回歸

後續 source review 發現 SPA 名單的新 cell 曾額外使用 booking.update 限制標籤入口。現已移除這個額外條件，維持舊版由 CustomerLabelsProvider 的 customer.update／門市範圍與既有後端檢查决定；本次備註仍只依 booking.update 與原本可編輯狀態開放。

新增相反權限組合測試：customer.update 允許、booking.update 不允許時，標籤可操作但本次備註不可編輯；反向時標籤不可操作但本次備註入口仍可用。沒有增加權限或真實資料操作。

這項修正改變 SPA 的 runtime。e032 的舊 READY Preview 僅供歷史／初版記錄，不能當作此新版本已完成 UI 驗收；後續新版 Preview 部署與登入驗收另待確認。
