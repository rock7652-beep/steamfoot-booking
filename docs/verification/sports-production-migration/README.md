# 運動取消還點正式 migration 審查

本 PR 將 PR #1349 的候選登錄為 **Supabase migration `20261018020054`**，附上正式唯讀前置證據、22 項 history 處理方案與上線清單。只是 repository 登錄，**未合併、未執行任何 migration、未部署、未改 migration history**。

## 審查檔案

- `supabase/migrations/20261018020054_sports_cancellation_ledger_and_schedule_rules.sql`：正式向前 migration；與已演練 up **僅首行註解不同，所有可執行 SQL 完全一致**。
- `supabase/rollbacks/20261018020054_sports_cancellation_ledger_and_schedule_rules.down.sql`：受版本／結構指紋保護的手動 down，與已演練 down 完全一致。刻意放在 rollbacks，不讓 migration runner 自動執行。
- `release-manifest.json`：版本、SHA-256、執行狀態與未通過關卡。
- `checklist.md`、`readiness.json`、`read-only-check.sql`：2026-10-18 正式唯讀快照與上線／停止／回退順序。
- `history-reconciliation-plan.md`／`.json`：22 項逐項處理方案、原檔 SHA-256；全部仍為 PLAN_ONLY_NOT_RECONCILED。
- 先前驗收：`docs/verification/sports-migration-rehearsal-20261018.md`、`sports-migration-rehearsal-results.json`、`sports-migration-rehearsal-vitest.log`（已由 PR #1349 合併）。

## 執行範圍與停止關卡

僅擴充 CoursePointEntry_values 並建立 SportsStagingSessionRule；保留既有帳本格式、FK／RLS／ACL 與安裝指紋保護。**沒有修改卡片餘額、預約、舊課分類或 22 筆 history。** 安裝標記沿用已演練的 v1，與本筆 Supabase 版本的對應記錄於 manifest，不可人工偽造或補標記。

目前仍不能執行：需先確認可用備份／PITR、正式 app 實際角色對新表的權限、history 處置與最新 preflight，並取得單獨執行授權。若正式 app 不是表 owner／具適當權限的後端角色，須在執行前另審 SQL 的 GRANT／角色設計，並在捕捉 fingerprint 前完成；不得為了能寫入而開放 anon／authenticated 或移除 RLS。

執行路徑只允許審查完成的**這一筆 Supabase migration**，版本與 hash 必須相符；不新增排程、自動執行器，也不以全量 `db push`／`prisma migrate deploy`／一般 build 代替單筆執行。兩套 history 仍由原管理路徑負責，不登錄重複 Prisma migration。

若走 Supabase apply_migration 或其他核准機制，必須確保名稱／版本與檔案及實際 history 的對應可稽核；不得僅因同名就假設已執行。此次沒有呼叫該工具。

## 驗證與實際限制

- 使用 Supabase CLI 2.54.11 的 `migration new` 產生空檔，再填入已演練 SQL；該命令只建立檔案，不連 DB、不執行 migration。未改動 repository 的依賴設定。
- 對正式 up 與已驗收候選做可執行本文逐位元組比對；down 全檔比對；manifest SHA-256 與原 30 項證據中的候選 hash 一致。
- 本次遵守「不要執行 migration」，**沒有重跑任何本機／測試／正式 migration**；30 項為 PR #1349 已完成的隔離演練，不能稱為本 PR 新執行的資料庫測試。
- 本 PR 分支的 Vercel Git 部署停用；Vercel／Workers／Pages 建置分支標記進入 ci-migrate 時會在 DB 操作前拒絕。main 的 Vercel Git 部署保持停用。Cloudflare 依既有指示跳過，不以解除保護換取通過。
- 新版正式 UI／功能啟用仍需另案審查；本 migration 成功不會開啟新版介面。
