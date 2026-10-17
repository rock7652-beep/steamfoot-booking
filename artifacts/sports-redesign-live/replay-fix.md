# PR #1346 排課重送修正

- 規則先經同一 Zod schema 解析後比較，不再依賴 PostgreSQL JSONB 的欄位順序。
- 新請求只傳自動配卡意圖。Store 鎖內先找原請求收據；只有首次建立才選擇足夠且適用整批課次的卡片，並沿用原預約核心保留額度。既有 metadata 曾保存實際卡號的收據也可對應同一自動配卡意圖；明確改成其他卡號仍拒絕。
- 重送驗收解碼 Server Action 的業務結果，必須 success=true 並回傳原 sessionId/count；HTTP 200 不代表成功。

驗證：16 項新增回歸通過（`replay-unit.log`），涵蓋 JSONB 外層／學員欄位重排、既有配卡收據、不同規則／方案／學員／明確卡號拒絕、整批配卡、額度不足，以及 HTTP 200 但業務失敗不得通過驗收。

真實本機 Next + PostgreSQL 驗收（`replay-checks.json`）：介面購買十堂方案，指定八堂後可用只剩兩堂；相同請求與兩次並行重送均業務成功，課次、預約、原卡及餘額完全不變。相同請求改人數或學員仍拒絕，整段維持同一頁面文件。

TypeScript 與修改檔案 ESLint 通過。完整 Vitest 與 GitHub 最新提交 CI 結果於 PR 說明更新。本次僅操作隔離測試資料庫，沒有正式 schema migration、合併或部署；Cloudflare 繼續略過。
