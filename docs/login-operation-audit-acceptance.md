# 登入與操作稽核 — 實作與驗收狀態

分支：feat/hq-login-operation-audit；草稿 PR #1240。未合併正式站。

## 已實作

- 共用登入／操作分頁及互查；登入成功／失敗、姓名／角色快照、概略裝置、最近使用時間。
- 登入識別來自伺服器驗證 session；舊 JWT／舊紀錄不虛造登入關聯。
- audit.read 權限、店家強制本店、HQ 授權店家視角；未知帳號不臆測門市。
- 三套 Prisma client 在交易前取得已驗證身份，再在同一連線設定交易上下文。並行請求、不同登入、背景工作互不共用身份；交易內不另開 auth 連線。
- auditLog.create 與交易內舊 SQL 寫入均接入身份快照；資料庫 trigger 驗證登入屬於同一帳號且登入成功。AUTO_ 動作保留觸發者並標示系統自動。
- 舊 SQL 入口也遮蔽巢狀敏感欄位；HQ 操作依目標／快照確認門市。課程模組在原始交易時固定 MUSIC／FITNESS，避免補記時重新分類。
- SPA 預約／修改／取消／結帳及課程預約、候補、出席、名冊、容量升補，在業務交易內寫入持久補記佇列。佇列失敗使業務回滾；提交後安排送達，原始時間／操作者保持不變。
- 送達與 ACK 同一交易，穩定事件 ID 防止重複；失敗退避重試，不丟棄未送達證據。頁面顯示「補記中」，僅計算授權店家範圍。
- 跨店檢視先持久記錄切換請求，再設定 cookie；一般人員沒有刪改證據入口。
- 補記 cron 每 5 分鐘；一年保留維護每日執行。均限 production 且需 CRON_SECRET。清除預設停用，需 AUDIT_RETENTION_ENABLED=1；保護未送達證據與仍使用中的登入。
- 僅此支線 Preview、僅已確認隔離的兩條 DB connection，可重複套用本功能兩份增量 SQL；以交易及 advisory lock 避免並行遷移，不執行其他 pending migrations。
- StaffLoginRecord／OperationAuditOutbox 啟用 RLS 並撤銷 anon／authenticated 權限。不保存密碼、驗證碼、憑證、原始 IP／User-Agent。

## 已驗證

- 稽核相關測試：17 組、186 個通過（2026-10-07）。涵蓋登入與權限、交易上下文並行隔離、SPA／課程業務、登入關聯、敏感資料遮蔽。
- PGlite 隔離 PostgreSQL 執行實際兩份 migration：舊 SQL 身份／門市／遮蔽、commit／rollback 上下文重置、錯誤登入關聯、ACK 失敗回滾／重試冪等、保留政策、RLS、模組快照及 Preview 重複遷移通過。
- 完整 TypeScript、修改檔案 ESLint、diff whitespace 通過；Prisma client 生成成功。
- 營業時間／課程值班邊界修正：另 7 組、68 個測試通過（營業時間／值班、付款拆分、店家網址 helper）；純計算與前端 helper 不再引入 DB／session。
- 上述 PostgreSQL 測試使用最小隔離 schema，不能代替完整 Supabase schema／Prisma／瀏覽器端到端驗收。

## 發布與剩餘驗收

- 提交 6445699 的隔離 Preview 遷移成功，建置紀錄 audit_schema_ready=true；本機 Next 編譯已通過；共用營業時間、錯誤類別、店家網址 helper 的伺服器邊界已修正。待最新版本 Vercel 完整建置。
- 待隔離環境 Email 登入成功／失敗、停用帳號、HQ 代操作、跨店限制、操作與登入互查，以及實際 Prisma 三套連線交易驗收。
- 待 1366／寬螢幕、1024×768／768×1024 iPad、390／360 手機；長名稱、50 筆以上、分頁、空資料、錯誤、鍵盤、旋轉與篩選保留驗收。
- 本機沒有 DATABASE_URL／DIRECT_URL；不使用正式資料庫驗收。Preview 登入與真機驗收未完成前，維持草稿，不視為可合併。
- 清除環境開關仍停用；正式遷移、清除啟用、合併與正式發布均未執行。

## 2026-10-07：操作紀錄白話化

- 納入列表、展開詳情，以及四模組各筆資料的「查看紀錄」入口。共用白話摘要、角色與修改前後欄位，不再以動作代碼、資料表名、資料 ID 或原始 JSON 作為顯示 fallback。
- 顧客、蒸足／SPA／課程預約、方案、人員、收支、進銷貨與盤點等，依已授權紀錄的門市批次補查辨識內容；歷史快照優先，現在的姓名／名稱明確標示為目前資料。缺漏或已刪除資料不猜測。
- HQ 切換事件保持「申請」語意，不能因先記稽核就聲稱切換已完成；系統自動與觸發人員分開。
- 6 組相關測試共 26 個通過（含 11 個白話呈現／跨店名稱查詢測試），完整 TypeScript、修改檔案 ESLint 與 diff whitespace 通過；本機補齊既有 PGlite 測試依賴並提高 TypeScript 記憶體上限後完成檢查。
- RWD：保留原清單／行內展開；摘要與詳情可換行、內容維持 14px；五欄只在寬畫面排列。需驗桌機 1366／寬螢幕、iPad 1024×768／768×1024、手機 390／360、長名稱、鍵盤與旋轉。
- 當次雲端瀏覽器存取固定支線 Preview 回傳 502（Connection refused），一次重新載入後仍相同。Vercel 查詢確認原 662aa66 部署 READY；不可據此認定瀏覽器或登入後流程已驗收。新版白話化的 Preview 與真實資料驗收仍待完成。

### 遠端驗收缺口補齊

- 2cdc4cb8e Preview READY、遠端型別／ESLint／targeted tests 通過。完整 Vitest 發現新增跨模組稽核 reader 尚未列入明確查詢邊界；音樂真實 PostgreSQL 測試缺少 public 稽核 outbox。
- 已補上只讀 reader 的邊界宣告與 SPA 精確 storeId／targetId、不讀蒸足 Booking 的測試，保留原模組防火牆檢查。
- 音樂補課／通知的隔離 fixture 以實際 migration 的 outbox DDL 建表，只允許 loopback 且資料庫名稱結尾為 _test；清理只刪除本測試產生之 storeId 的 outbox，不更改正式 migration 或業務交易。補课重複預約同時驗證只保存一筆待送紀錄。
- 本機 8 組、30 個相關測試、完整 TypeScript、修改檔案 ESLint、diff whitespace 通過；真實 PostgreSQL 流程仍以本次遠端重跑結果為準。

### 登入後實際畫面驗收

- 2026-10-07 固定支線 Preview 已可開啟，安全登入總部成功；操作列表顯示 244 筆、5 頁，實際看到人員、店家、顧客／預約／收支辨識內容與中文動作。
- 抽查權限及更正收款方式詳情：金流欄位顯示日期、轉帳與原因，未曝光原始欄位或動作代碼。發現舊權限紀錄使用 granted／denied 快照，原 reader 只解析 permissions，導致中文權限說明缺漏。
- 補齊四種權限快照形狀的中文解析；真正缺漏的權限以數量摘要顯示，避免重複數十次相同文字。白話呈現與授權範圍測試共 13 個通過，修改檔案 ESLint 通過。修正版 Preview 畫面仍需確認。
- 桌機／iPad／窄容器尺寸、各模組資料入口、店員跨店限制與登入互查尚未完成，不將本次總部抽查視為全部驗收。
