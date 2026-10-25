# 美業開店啟動接點修復（2026-10-25）

## 目標與範圍

讓 HQ 建立美業店後，可直接使用已確認的共用服務／收費／技師介面與開店檢查，不需要再請工程師修改逐店環境變數。遵守既有範圍：本次不建立正式店、不修改既有顧客或交易、不複製測試資料、不開 LINE；不使用 SPA 介面。

## 修復

1. 新增 Production 專用 module rollout，須同時符合正式 Vercel/main/repository、受限 Beauty connection、模組及收費旗標。只有已經由 beautyManager/requireBeauty 授權的美業流程使用此能力；不取代權限、跨店與業務檢查。Preview 保留原逐店 rollout。
2. 新店立即具備新版收費與開店檢查入口。價格、體驗時間及技師限制仍由店家明確設定；不建立預設服務或方案。保留獨立的收費編輯開關，暫停編輯不會關閉既有預約限制。
3. 美業建店改為同一 Prisma transaction 完成店舖、設定、模組紀錄、負責人／初始人員、角色權限與七天營業資料。權限初始化使用同一 transaction client；後段失敗整批回復，不留下部分帳號或權限。沿用既有角色預設，音樂／運動／蒸足流程保留。
4. 沿用新店自行預約預設關閉與開店引導。店家先設定基本資料、營業時間、位置、服務、技師、收費，再做開店檢查，由店家決定開啟顧客自行預約。檢查本身不建預約、不收款、不開 LINE。

## 驗證

- 174 檔、1,562 項相關離線回歸通過，包含新店 rollout、建店交易呼叫與失敗回復、角色、收費儲存、開店檢查、權限及共用流程。
- 建店回復測試使用 transaction mock，沒有在正式庫建立店家。既有 Prisma transaction 原子性由資料庫提供；不將 mock 當成真實正式店驗收。
- TypeScript noEmit 通過；本輪異動檔 ESLint 通過。沒有改 UI 標記或重新設計介面；沿用前一版 307 張假資料版面及使用者先前手機／平板確認。
- 正式唯讀基準 Beauty store=0；只新增 Production BEAUTY_CHARGE_RULES_SCOPE=module，其他旗標、主連線及 LINE 關閉保留。

## 發布狀態

待同一候選版本完成正式 pg／Prisma 唯讀檢查、完整建置與網域核對後，補上實際結果。本檔目前不是已部署成功證明。

## 第一批正式更新確認

- 正式部署 dpl_Hansuh7ffKFMR9KRTE1UyWfnwX5K 已 READY，程式 50a2772cd5adb7db83e70613f45bd61c8206059f；steamfoot.com 與 www.steamfoot.com 均已指向此部署。
- 正式建置確認 runtime_login=true、tls=true、prisma=true、schema_tables=14、readonly=true、migration_target_absent=true、charge_scope=module、editing_enabled=true。ci-migrate 回報 migration_skipped_no_target；此輪未執行 migration。

## 30 天試用入口補齊

使用者於正式 HQ 建店頁發現英文方案選單。實查美業仍使用舊方案選單且可能沿用前一模組 GROWTH 值，未接回共用 30 天試用呈現。

- 美業選擇時帶入 EXPERIENCE，表單清楚顯示「30 天完整功能試用」。後端同步固定新美業店方案為 EXPERIENCE，避免舊客戶端帶入其他方案。
- 建店只準備待啟用資料，沒有提前起算。HQ 在店舖詳情點既有「開通 30 天單店試用」，才使用共用開通服務寫入當日起算、含末日的 30 天訂閱。
- 沿用既有訂閱 transaction 及 advisory lock；美業亦拒絕已有訂閱、期限或歷史 TRIAL_STARTED 的重複開通，保留既有期限；不透過新增訂閱重設倒數。
- 既有正式店及訂閱未修改。蒸足原有自訂試用與音樂／運動的試用流程保留。美業店名提示改為「美業 XX店」。
- 180 檔、1,636 項相關回歸通過；TypeScript noEmit、異動檔 ESLint、差異檢查通過。
- 本機真實共用表單以合成畫面驗收 1366×900、1024×768、768×1024、390×844，選項、模組切換與起算說明正確，沒有水平溢出或前端例外。後端與外網封鎖，未建立正式店，這不是正式登入建店驗收。
- [調整前](evidence/20261025-launch-ready/trial-ui/before-1024.png)／[調整後](evidence/20261025-launch-ready/trial-ui/after-1024.png)。

試用修正候選尚待正式建置與網域核對，完成後補記實際部署 ID。
