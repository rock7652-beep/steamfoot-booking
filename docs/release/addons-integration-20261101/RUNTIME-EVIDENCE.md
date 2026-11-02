# 實際連線身分驗證交付

狀態：本機驗證工具與案例完成；正式 runtime 的執行證據仍未取得。沒有新增部署、解密密碼、環境設定變更或資料庫寫入。

## 已補齊

- `src/server/services/addons-runtime-evidence.ts`：接收現有 Beauty 應用 client 與同一個有效連線設定；只允許審查過的 Supabase 目標與美業角色，不開第二條管理連線、不 SET ROLE。以有時間上限的 READ ONLY transaction 讀系統目錄，查真實 current_user／current_database、角色提升權限、新美業表／欄位及不可變款項 trigger 啟用狀態。回應只有布林值與 PASS／BLOCKED／UNAVAILABLE。
- `scripts/addons-runtime-check.ts`：使用現有 beautyPrisma 與 buildBeautyDatabaseUrl 的受信任執行入口，缺審查 marker／正式 main 範圍時在載入連線 client 前拒絕。不接入 build／CI，不新增公共 API。
- 11 個單元案例：受限角色通過條件、身分／資料庫不符、提升角色、缺 schema／歷史保護、錯誤目標不連線與例外遮蔽。ESLint／全專案型別檢查通過；實際 CLI 未設定 marker 時回 UNAVAILABLE 並以非零狀態結束，未接觸資料庫。

## 結果的意義

PASS 只代表此組連線與 catalog 檢查通過，不代表完整租戶隔離、金流併發、備份恢復或正式可發布。BLOCKED 表示已取得連線但條件不符；UNAVAILABLE 表示未取得足夠證據，不能當成通過。

腳本在本機、build container 或管理者資料庫連線執行，都不能被標成正式 Function runtime 證據。Vercel 的現有查核工具無法在正在服務的 Function 中直接執行此 CLI，正式站也沒有既有受保護的對應入口。不得拉取正式密碼到本機，或以新增任意 SQL API 來繞過。

## 真正取得正式證據的界線

需要在正式版本的受保護後端診斷路徑呼叫此 helper（僅經現有 HQ 身分授權，固定目標／角色與短期用途），或由既有維運機制在同等 runtime 內執行。新增入口／部署並不包含在本輪本機修改範圍；目前未實作或開放此類 HTTP 入口。

若安排雲端操作，應以當下正式版本建立最小診斷變更，而非直接部署本附加項目整合版（正式庫仍缺 schema）。先固定 SHA、確認自動建置觸發與通知不變；集中一次必要建置，費用取決於 Vercel 方案、建置時間與用量，現階段無法可靠估算。舊 QA 使用不同帳號與資料庫，不能替代正式 runtime 證據。

正式資料庫七表／七欄缺口與實際角色尚未核實的發布阻擋維持；本輪沒有宣稱已完成正式驗收。
