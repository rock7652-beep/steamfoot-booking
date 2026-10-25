# 美業日常流程改善 — 2026-10-26

## 原因與變更

- 預約時段：管理者只選一個時間，原本仍逐一驗算全日時段。改為先驗算指定時間；有衝突才搜尋三個最近可用時間。保留多人、技師、位置、整理時間、額度、權限與最終交易檢查；顧客前台完整時段清單保留。
- 時間選擇：美業營業時間與技師服務時間共用選單，保留既有非半點時間，提供自訂 HH:MM；其他模組維持原生時間輸入。
- 顧客同步：清單與班表使用當下有權限讀取的姓名／手機；查詢限本店與當下顧客。編輯期間合併更新事件，關閉後重新讀取相關清單，保留搜尋、篩選與捲動；歷史預約快照不改寫。
- 計時：瀏覽器 performance entries `beauty.booking.availability` / `beauty.booking.submit`；伺服器 trace `booking.availability` / `booking.submit` 含授權、輸入、資料、分配及交易分段。

## 驗證

- 134 個測試檔、1,060 項相關測試通過；TypeScript 通過；ESLint 0 errors，ScheduleManager 兩個既有 dependency warnings；差異檢查通過。
- 原版相同程式與相同七時段 fixture：成功時 allocation 原為 7 次，現為 1 次；衝突找到三個替代時段由 7 次降為 4 次。這是分配驗算次數，不是遠端延遲秒數或 SQL 數量。
- 實際共用營業／技師元件，在 1366×900、1024×768、768×1024、390×844 共八組本機 Chromium 畫面，選取與原儲存契約通過、無頁面水平溢出。使用假資料及攔截儲存；不是正式庫交易或實機 Safari 驗收。
- 舊版也失敗而未改動的三檔未納入上述相關測試：beauty-course-catalog-ui（next/server 載入）、beauty-course-plan-ui（過時的完整 HTML 相等）、service-hours-save-database（舊 SPA 預期）。保留原斷言。另一共用元件測試僅補齊 useSearchParams mock，原四項斷言均通過。

## 發布範圍

無 schema／migration、正式測試交易、權限、LINE 或環境變數變更。已整合最新主線，保留音樂／運動改動；整合後追加七檔 39 項回歸與 TypeScript 通過。

## 正式發布結果

- PR：https://github.com/rock7652-beep/steamfoot-booking/pull/1423（已合併）。
- 正式提交：`d537b996e7cb5a0c3088fb115f0dc6e194c28906`。
- Vercel Production：`dpl_3afGi7NgDh2U1i8emZfeueXCJ99Y`，READY；建置完成，readonly preflight 通過，`migration_skipped_no_target`。
- `www.steamfoot.com` 及 `steamfoot.com` 均指向本次部署；前版 `dpl_5qmbPdtfCNp1zVhqA3haKxzWXnYe` 留存。
- 唯讀匿名檢查：官網、HQ 登入及 session 回應 200；美業 HQ、店家私有頁正確 307 至登入，無 5xx 或伺服器錯誤頁。不是登入後正式交易驗收。
- 截至 2026-10-25 21:54:42 UTC，本部署近五分鐘 error／fatal 查詢無紀錄；短期觀察不代表所有業務流程均已實測。
- 證據：`artifacts/beauty-daily-flow-20261026/`。遠端實際預約耗時需透過此次新增的分段計時觀察，不宣稱已從 3–5 秒降低至特定秒數。
