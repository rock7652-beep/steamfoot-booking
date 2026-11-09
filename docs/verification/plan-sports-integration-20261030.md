# PR #1468 與 #1470 整合驗收（2026-10-30）

本次建立獨立整合分支與 Draft [PR #1471](https://github.com/rock7652-beep/steamfoot-booking/pull/1471)，確認方案管理與運動課表優化共存。尚未合併 main、未部署正式站，也不包含 #1469 的三模組方案餘額合計。

## 版本與環境

- main 基準：`a3568643`。
- #1468：`4a5687331a4fa4d8db620146f04a0c3cefb75b41`。
- #1470：`58e32d0ead3b2401f83b3d639527905ab87d51a8`。
- 分支：`review/plan-management-sports-performance`；應用驗收版本：`4e167b02bbddff882e24a10c6f80870baa6f824c`。後續提交僅補驗收器與紀錄，Preview 仍固定此應用版本。
- [整合 Preview](https://steamfoot-booking-akchjnk4s-rock7652-2111s-projects.vercel.app)，部署 `dpl_FcS8XJKVy34RMCPqHJEASeUGYrvM`。
- 合併衝突僅兩份分支／建置設定，保留原有分支並新增精確整合分支。另補同一整合分支的音樂 capability，僅限既有 `store-lubymusic`，不授權資料匯入或正式發佈。
- Preview 保持 Vercel 保護；雲端瀏覽器使用同專案 OIDC、僅對精確部署 origin 附帶保護標頭，應用仍走真實帳密、權限與 Server Actions。
- 建置紀錄確認：`[sports-redesign-preview] isolated_database=true migrations_skipped=true notifications_blocked=true`。沒有執行正式 migration 或通知 worker。

## 驗收範圍與結果

這是**隔離資料庫上的合成業務流程驗收**，不是銀百合正式資料、實體 iPad 或店長現場驗收。僅使用使用者已授權的 `sports-live-flow-store`、`store-lubymusic`、`beauty-hosted-20261021`；全部新增資料均標記 QA1469。未啟用原 #1468 的其他 QA 店。

| 流程 | 結果 | 證據與限制 |
| --- | --- | --- |
| 運動、音樂、美業正常帳密登入 | 通過 | 運動另驗錯誤密碼不產生登入 session；無靜態資源載入失敗或 pageerror |
| 三模組方案延長、縮短與註銷 | 通過 | 原頁操作、原因與輸入在 iPad 尺寸保留；重新整理後狀態仍正確 |
| 三模組有保留預約時阻擋註銷 | 通過 | 使用既有 QA1469 old 卡與 RESERVED 預約 |
| 音樂已提交但回應遺失後重試 | 通過 | 相同請求重試；資料庫確認一筆 VOID、一筆 CLOSE_CARD 稽核 |
| 三模組點名、還原與重新整理 | 通過 | 原始預約最後均 RESERVED、原卡剩餘 1；1366×900、1024×768、768×1024 無溢出 |
| 運動排課載入、失敗重試、課程清單 | 通過 | 未開窗不讀取選項、開窗先呈現、僅一次 GET、失敗在窗內重試；1366×900、1920×1080、1024×768、768×1024 草稿保留且無溢出；跨店讀取拒絕 |
| 蒸足方案交易與並發 | 10 項 PostgreSQL 測試通過 | 僅一次性 loopback PostgreSQL 16，包含課程／蒸足註銷、防重、保留量、並發、稽核失敗回滾；本次未重做 hosted 蒸足 UI |

證據：[方案管理](plan-sports-integration-20261030/management.json)、[點名／還原](plan-sports-integration-20261030/attendance.json)、[排課／清單](plan-sports-integration-20261030/planner.json)、[交易測試](plan-sports-integration-20261030/postgres-summary.json)。

驗收器曾因 null session 斷言、原生運動卡片入口與音樂卡片分頁假設而中止，修正的是驗收器選取方式，未改應用流程。運動已完成的操作未重複提交；音樂／美業另行續跑，證據保留來源。一次中斷的音樂點名亦先由正常 UI 還原再重驗。原始部分失敗報告仍留工作區，不改寫成完整成功。

## 原紀錄與清理

測試前技術截止時間 `2026-10-30T03:58:58Z` 以前的原始資料，在測試後逐列 JSON 聚合摘要完全一致：CoursePurchase 125、CoursePointEntry 921、BeautyPayment 90、BeautyLedger 121。新操作依法新增的稽核／扣抵／還原紀錄不列入原紀錄摘要。此時間只用於比對，不作營業日判斷。

三張新增管理卡均 closed、remaining=0，每卡僅一筆註銷 ledger；運動／音樂各僅一筆 CLOSE_CARD 稽核。原三張卡 remaining=1、原三筆預約 RESERVED。[資料庫核對摘要](plan-sports-integration-20261030/authority.json) 僅含 QA 識別、筆數、摘要與狀態。

完成後確認三個臨時 User 均 SUSPENDED、passwordHash=NULL，三個 Staff 均 INACTIVE，刪除兩份臨時密碼檔、關閉測試瀏覽器並移除本次 PostgreSQL 容器。沒有停用門市或刪除稽核。完整頁面截圖可能含既有隔離店其他姓名，僅留工作區 `/workspace/reports/plan-sports-integration-20261030`，不提交至公開倉庫。

## 正常 HTTP 快取下的課表量測

新增獨立快取模式，使用原生 CDP Fetch 附帶精確 origin 的保護標頭，避免 Playwright route 關閉 HTTP cache。每組一次暖機、四次重複讀取；重複樣本每次均 37 個資源命中記憶體快取（非 disk hit），其中包含 Next CSS／JS。兩版課表均 36 張卡，內容摘要完全一致。

| 樣本 | 第一次讀取 | 重複讀取四次 | 重複中位數 | Server 計時區間中位數 |
| --- | --- | --- | --- | --- |
| 原 #1470 計時 Preview | 2475 ms | 1878、1798、1867、1605 ms | 1832.5 ms | 855.25 ms |
| #1468 + #1470 整合 Preview | 2828 ms | 2053、2083、1740、1897 ms | 1975 ms | 944.8 ms |

原始各階段、瀏覽器 Navigation Timing、快取資源與卡片摘要：[參考樣本](plan-sports-integration-20261030/cache-baseline.json)、[整合樣本](plan-sports-integration-20261030/cache-optimized.json)。檔名 baseline／optimized 沿用驗收器參數，這次代表前後整合比較，不代表本表證明變快。

此小樣本**不能宣稱整合後有加速**；比較涉及不同部署實例、暖機及雲端代理，亦不能與先前停用 HTTP cache 的 2.57 秒直接比較。Server 計時只涵蓋已標記區間，讀取有並行與重疊；Navigation Timing 亦受串流影響。不能將端到端扣掉某個 Server 數字的差值直接歸因前端或資料庫。實際店家與實體裝置速度仍需獨立現場量測。

## 程式檢查與待完成事項

- 應用版本 CI：[Full Vitest baseline、Targeted tests、Typecheck、Changed-file ESLint 均成功](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/40999819780)。另 sports-shared-card-postgres 成功。
- 本機針對兩 PR 與整合 guard 的 13 檔 99 項測試成功；修訂 guard 後的 8 檔 63 項成功，兩者有重疊，不能相加當總數。Typecheck、驗收腳本語法／ESLint、diff whitespace 檢查成功。
- 本機一次性 PostgreSQL 的 plan-card-management：10/10 成功、0 skipped；未對遠端執行 disposable schema 測試。
- Vercel Preview 建置成功；**Workers Builds: steamfoot-booking 失敗**。尚無該平台詳細建置日誌，不能斷言原因或宣稱所有外部檢查成功；合併前應釐清／解除。
- 尚未完成實體 iPad／Safari、銀百合正式資料的實際業務驗收、本次整合的 hosted 蒸足、音樂逐期完整流程或送出新排課。桌機／iPad 尺寸是雲端 Chromium viewport，不能等同實體裝置。
- 若任一來源 PR 或 main 再變動，須更新整合基準與相應驗證。須先解除上列阻擋並取得明確上線授權，才進行正式合併／部署。
