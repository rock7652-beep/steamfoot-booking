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
- 營業時間／課程值班邊界修正：另 3 組、43 個測試通過；純計算模組不再引入 DB／session。
- 上述 PostgreSQL 測試使用最小隔離 schema，不能代替完整 Supabase schema／Prisma／瀏覽器端到端驗收。

## 發布與剩餘驗收

- 提交 6445699 的隔離 Preview 遷移成功，建置紀錄 audit_schema_ready=true；Next 建置發現既有課程值班的前端共用函式引入 DB 邊界，已拆分純函式，待修正版本建置。
- 待隔離環境 Email 登入成功／失敗、停用帳號、HQ 代操作、跨店限制、操作與登入互查，以及實際 Prisma 三套連線交易驗收。
- 待 1366／寬螢幕、1024×768／768×1024 iPad、390／360 手機；長名稱、50 筆以上、分頁、空資料、錯誤、鍵盤、旋轉與篩選保留驗收。
- 本機沒有 DATABASE_URL／DIRECT_URL；不使用正式資料庫驗收。Preview 登入與真機驗收未完成前，維持草稿，不視為可合併。
- 清除環境開關仍停用；正式遷移、清除啟用、合併與正式發布均未執行。
