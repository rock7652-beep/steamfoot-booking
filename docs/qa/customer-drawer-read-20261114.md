# 蒸足顧客搜尋選取與摘要讀取 — 本機驗收

日期：2026-11-14（Asia/Taipei）。原執行者：本對話 Codex。基底：`efbbe5a15590feecc0b95bf155141eaeb08340aa`，工作分支 `fix/analysis-30day-renewals-20261114`，尚未 commit／push／部署。本工作區另有本對話授權的分析改動，發布前須依實際交付範圍整理版本；此紀錄只證明顧客讀取修正。

## 修正範圍

- 蒸足顧客搜尋候選接清單現有開窗機制，包含非目前頁顧客。保留篩選、分頁、URL、未儲存防護與返回；尚未送出的搜尋計時器不會在開窗後發起清單導航。
- 主要 action 不等待預約／待收款／健康摘要。摘要改同源獨立 GET，沿用原摘要 action 的登入、門市與分項權限檢查；不得採用請求的 storeId。
- 摘要有載入、失敗、重試與 15 秒逾時，關閉／換人會中止客戶端 fetch，已在伺服器開始的查詢不保證中止。晚到結果隔離、異動後重讀；付款仍以原 action 確認權威結果。
- 原生音樂／運動／美業顧客主要讀取未改；全站手動篩選與消費搜尋清除計時器尚未修復。預約入口的 customer-panel-context 仍沿用其完整 payload，不列入此次改善。

## 已驗證

11 個測試檔、69 項通過：`customer-search-drawer-open`、`customer-panel-summary-loading`、`customer-drawer-list-sync`、`customer-store-consistency-actions`、`customer-summary-read`、`customer-instant-search`、`customer-drawer-consumption`、`customer-note-pending-preview`、`trial-plan-entry-ui`、`customer-inline-detail`、`course-customer-search-ui`（皆位於 src/__tests__，副檔名 .test.ts）。

涵蓋：基本 action 不請求摘要、權限拒絕先於資料查詢、route 參數與 no-store、門市前綴與 Date 還原、非目前頁顧客、搜尋無整頁導航、計時器不晚送、晚到回應不換錯人／重開、摘要錯誤重試、逾時中止、已修改資料不沿用初始摘要、關閉後清單同步。

`tsc --noEmit --incremental false`（Node heap 8192 MB）、受影響檔案 ESLint 與 `git diff --check` 通過。

## 局部視覺驗收

Chrome 本機合成 fixture，實際 `CustomerPanelSummaryView` 與共用 `RightSheet`；主資料僅為 fixture，不代表完整顧客頁。1366×900、768×1024 模擬尺寸確認：基本資料持續可見、摘要載入提示、錯誤就地重試、重試成功。平板頁寬與 scrollWidth 同為 768，關閉鈕高 44 px。截圖在本對話 CUA 工具觀測中；此預覽未連正式資料，服務驗收後已停止。2.5 秒摘要等待是人工 fixture 延遲，不是正式效能測量。

## 待正式驗證

尚未部署或使用正式／隔離登入帳號驗證，未量得真實網路下冷／暖端到端的次數、中位數與範圍，也未證實店家回報的一分鐘各段耗時。固定 `customer-drawer-primary`／`customer-drawer-summary` 計時僅涵蓋函式進入後的服務端時間，無顧客識別或內容；正式驗收仍須從操作到完整資料可用觀察，不以開窗外框或伺服器時間替代。

Cloudflare、資料庫 schema、通知與部署設定沒有變更；本機 fixture 無外部依賴，不需 Cloudflare 操作。此紀錄不授權 push、Preview、合併、正式發布或正式交易。
