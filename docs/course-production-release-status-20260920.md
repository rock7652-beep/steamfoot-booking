# 課程正式發布狀態（2026/09/20 17:41 台灣時間）

## 最新範圍與結果

使用者取消額外正式備份匯出、Docker 還原與憑證索取；這些不再是本次發布門檻。沿用 Supabase 每日備份。正式遷移、合併與部署的既有條件式授權保留。

**2026/09/20 17:49：使用者確認沿用既有豁免與授權後，相同 Supabase apply_migration 工具接受審核，正式 15 份課程遷移及 2 筆 TrialCare 歷史補正已成功提交。沒有改用其他入口繞過。發布後查核進行中，合併／部署結果另記錄於 PR 發布摘要。**

## 發布候選與證據

- 候選：`840cccd8072dcb8f40fb3d18b2ef1b0e012cfb0d`，PR #1022 維持 Draft。
- 已整合 main `e469f9b133a4dac717dcedbd4e8609c78061e2cb` 的 8 筆較新 LINE／會員修正，無衝突；PR #1051 原已整合，未重套。
- CI `35502779019`：Changed-file ESLint、Typecheck、Targeted tests、Full Vitest baseline 全部成功；逐步檢查沒有 failure，不以 continue-on-error 掩蓋。
- PostgreSQL 整合 CI `35502779007` 成功。
- 本機型別檢查及此次 main 整合影響的 7 檔／104 項 LINE、體驗、通知測試通過。
- Vercel Preview `dpl_BfK329pHJ6XEm6CCLX3wX6xwhcqd` READY，對應相同候選 SHA，既有課程 branch alias 未換店。
- Cloudflare Workers：FAILURE，按使用者既定決策**豁免，不是通過**。

## 正式資料庫與每日備份

- 正式專案：`qijlnhtpbintanzpxkvf`；隔離 A 店不在此庫。
- 由 Supabase Scheduled backups 頁唯讀確認：最新備份 `2026-09-19 17:23:31 UTC`，即台灣 `2026-09-20 01:23:31`，類型 PHYSICAL；列有連續 7 天備份。
- 未按 Restore、未匯出正式資料、未進行 Docker 還原；每日備份存在不等同本輪實測恢復通過。平台頁明示 Storage 實體物件不包含在資料庫備份。
- `2026-09-20 09:41:10 UTC` 拒絕後確認：Course 表 0、有效 Prisma 歷史 82、此次 release 歷史 0，正式庫沒有本次部分套用。
- 兩份 TrialCare 實際欄位、型別、預設、PK/FK/unique/index/RLS 已核對；既有 Supabase 歷史存在，只需補 Prisma 歷史，禁止重跑 DDL。

## 精確執行包與影響

來源：`course-full-migration-rehearsal-20260920.json` 的 15 份原始 SQL，逐檔 SHA256 相同。順序為 3 份 Prisma 基礎遷移，再 12 份 Supabase 課程增量。

組裝器：`../scripts/course-production-release-20260920.py`，只產生 SQL，不讀憑證或自行連線。

執行包：`course-production-release-20260920.sql`；SHA256 `d1b0fbe92c11f6531e18feba0bd7eb9bd8b6f884fc46ea3c447e7ac8cf97fe6d`。

- 外層單一 REPEATABLE READ 交易，lock timeout 5 秒、statement timeout 60 秒、transaction advisory lock。
- Guard 核對已審查的 82 筆有效 Prisma 名稱與 checksum、沒有失敗 pending、沒有 Course 結構或 COURSE enum、TrialCare 結構指紋及既有 Supabase 歷史。
- Guard 已單獨在正式庫執行並 ROLLBACK，通過；尚未執行結構寫入。
- 課程表與 enum 為新增；共用 Staff／Customer／StaffMemberLink／MessageLog 僅新增課程欄位，原 STEAMFOOT/SPA 店別不改。
- 原始 SQL 的 Staff 更新限定 COURSE 店；正式庫目前沒有 COURSE 店，不重算舊人員、餘額、交易或預約。
- Store、Staff、Customer、StaffMemberLink、MessageLog、Booking、SpaBooking、Transaction 原有欄位於同一交易快照前後雜湊比對；任何差異即失敗回滾。雜湊只留 temp table，不匯出個資。
- 所有新 Course 表提交前確認 RLS。
- 同一交易登錄 3 份 Prisma 執行歷史、2 份 TrialCare 歷史補正、12 份 Supabase 精確來源 SQL；工具另記錄 release wrapper。無重跑建立結構，無刪除舊歷史。

## 正式發布與失敗處理

1. 自動審核允許後，以 Supabase `apply_migration` 執行上述原包；不得繞過拒絕。
2. 若工具回應不明，先查結構及歷史，禁止盲目重送。若交易失敗，確認全部回滾、分析原因；不合併。
3. 成功後核對 15 份結構、2 筆歷史補正、RLS／約束／來源 hash，以及無未解決失敗。原始 TrialCare 不重建。
4. 核對 PR head 沒有其他改動、CI 相符，才解除 Draft 並合併；Git integration 以 production 環境重新建置。**不可將連隔離庫的 Preview 直接 promote 為正式站。**
5. build 的 `ci-migrate.mjs` 沒有課程 target，不會自動完成這 15 份；必須先完成上述受控遷移，沒有新增讀 secrets 的流程。
6. 正式部署核對 SHA、READY、正式 domain、登入入口與健康／錯誤；沿用未受影響的隔離交易／手機證據，不將正式 HTTP 冒煙稱為正式交易全驗。
7. 若新應用出錯，回退原正式 `dpl_FRZ1TToVjwJJtu5BEDyQoxctmWe6`（main `e469f9b1`），保留新增 schema；目前沒有正式 COURSE 店，舊應用與新增空表／欄位相容。正式開始有課程資料後須先停該模組寫入並核對相容性，不能盲退。
8. 禁止 DROP 新表、抹掉營運資料或逕自還原整庫；資料災難恢復需另訂截止點與重建方式。

## 保留界線

A 店入口、方案、期限、會員關聯不變；本次未新增測試店、正式客戶店、付費資源或通知。實體 iPad／Safari／原生日期鍵盤未測仍保留；既有手機 LINE／Flex／返回與交易驗收不重跑。後續每家正式店的 LINE 設定、開通與通知需依既有個別授權處理。

## 正式遷移完成核對（17:51）

- Supabase release wrapper：`20260920094926_course_release_20260920_atomic`。執行包 hash 未變。
- 13 張 Course 表全部 RLS 開啟，無公開讀寫 policy，所有課程約束 validated。
- 87 筆有效 Prisma 歷史 checksum 全部符合來源（原 82 + 3 執行 + 2 歷史補正），未解決失敗 0。
- 12 份 Supabase 個別來源 SQL SHA256 全部符合原檔，另有 1 筆工具 wrapper。
- 同交易內 8 張原有資料表的既有欄位雜湊檢查通過才提交；未新增正式課程店。A 店未操作。
- 證據：`course-production-applied-20260920.json`。
- 最新文件候選 `8d5bfab6` CI `35503108353`、PostgreSQL `35503108379`、Vercel `dpl_2iEtM3vKmtqyeeWx8JFo7YRu5geT` 全部成功；Cloudflare 沿用豁免。
