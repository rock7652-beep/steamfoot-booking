# 運動模組 migration／回退隔離演練

2026-10-18（台灣時間）。來源 main `5a0ed085bbe94a3fa332c26e51db147a5b29aa17`。

結論：真實 PostgreSQL 的 1 個連續整合測試、30 個具名驗收檢查全部通過。沒有修改正式資料庫、合併 PR、呼叫部署或啟用正式站。

## 隔離與方法

使用既有本機 Docker PostgreSQL 中**新建**的 `sports_migration_rehearsal_20261018_test`（127.0.0.1:55438）。僅從既有假資料測試庫取得 schema，另植入假店家／假學員基本資料；沒有複製正式客戶資料。重建前次唯讀查得的正式 `CoursePointEntry_values` 限制，並移除新資料庫中的 SportsStagingSessionRule，以模擬正式缺表狀態。

測試檔拒絕其他資料庫 URL；設定的 DATABASE_URL、DIRECT_URL 也必須完全一致。呼叫既有 reserveCourseInTransaction、settleCourseBooking、correctCourseAttendance 與店家交易鎖；餘額、帳本和 SQL 限制皆使用真實 PostgreSQL。只替換未使用的外層授權入口／feature-gate 模組邊界，未 mock 交易方法。補課券使用案例由假預約呼叫真實出席扣點；不以直接調整餘額模擬已使用。

## 驗收結果

| 項目 | 實際結果 |
| --- | --- |
| 舊限制重現 | 出席取消、個別課請假取消、團體課請假取消、補課券回收皆因 CHECK 失敗；整筆交易回復，餘額、預約、帳本、券保持原狀 |
| migration 原子性 | 刻意在 DDL 後製造錯誤，限制指紋與缺表狀態完全恢復 |
| 乾淨回退 | 尚無新格式交易／metadata 時 down 成功；所有既有帳本逐筆一致；可重新 up |
| 重跑／漂移 | 第二次 up 拒絕不符原始指紋的限制，不留下部分變更 |
| 堂數與點數 | SESSION 10→9→10、POINT 10→8→10；兩個同時取消請求僅一次成功、一次還點 |
| 請假取消 | 個別課未扣堂維持 10；團體課已扣堂 9→10；CANCELLED:CANCELLED 記錄成功 |
| 請假撤銷回預約 | 個別／團體均恢復 RESERVED、清除 absenceKind，餘額正確回到 10 |
| 未使用補課券 | 原卡 10→9→10，券 1→0 並關閉，CANCEL_SOURCE 僅一筆；重送不能重複還點 |
| 已使用補課券 | 券經真實出席扣點至 0，取消原堂被拒，原堂與券狀態不變 |
| 不合法帳本 | 零／負點、未知 kind、空白來源、控制字元來源、不合法更正 UUID 全部被資料庫拒絕 |
| metadata | 排課頻率／選課模式／價格 CHECK、跨店 FK 拒絕有效；RLS 開啟，anon/authenticated 無 SELECT 權限 |
| 鎖定競爭 | 另一連線持有帳本排他鎖時，down 於 lock_timeout 中止，不更動資料 |
| 版本／結構漂移 | 9 種漂移均在破壞性 DDL 前拒絕：CHECK 替換、欄位／索引／policy 增加、RLS 停用、權限變更、版本缺失／不符、同名空表被替換 |
| 單一資料來源保護 | 分別驗證只有 metadata、以及只有新格式帳本時，down 都拒絕；原資料保留 |
| 交易後回退 | 存在新格式帳本時 down 拒絕；全部新舊帳本保留，擴充 CHECK 維持 validated |

## 候選 SQL 與正式套用前的限制

`scripts/qa/sports-migration-rehearsal/baseline.sql` 僅供重建舊限制；**不得拿去正式執行**。`up.sql`、`down.sql` 是供審查的演練候選，刻意放在自動 migration 目錄之外，未登錄正式 migration。

up 保留原限制，加入 `CORRECT:(RESERVED|ATTENDED|NO_SHOW|CANCELLED):CANCELLED:<uuid>` 與 `CANCEL_SOURCE:<非空、無控制字元的來源ID>`；後者支援現有文字型 booking ID。booking 存在性與權限由既有交易核心驗證，未開放任意 kind。新增 metadata table 的既有頻率值為 SINGLE／WEEKLY／BIWEEKLY，其餘一次性類型仍由 payload／既有核心表達。

SQL 使用單一 transaction、lock_timeout=1s、statement_timeout=15s。正式套用仍需重新讀取實際限制指紋；Postgres 版本／定義格式差異可能造成指紋拒絕，應重新審查，不能跳過保護。實際正式資料量／流量下的鎖定時間不由本次小型假資料演練推定。

回退規則：**只有安裝版本與結構指紋相符、尚無新格式帳本且 metadata 空表時才可 down**。已有交易後不得刪除新帳本、改寫交易 kind 或強制縮回舊 CHECK；改採應用版本回退並保留相容的擴充 schema，後續修正另行審查。若 metadata 已有資料也會拒絕 down，禁止為回退而清空。

本次不是瀏覽器／跨裝置驗收，也沒有宣告正式上線完成。正式 UI 啟用、正式 migration 與部署仍維持停用，需各自明確授權。

## 證據與重跑

- `src/__tests__/sports-cancel-migration-rehearsal.pg.test.ts`：真實資料庫測試。
- `sports-migration-rehearsal-results.json`：30 個具名檢查。
- `sports-migration-rehearsal-vitest.log`：成功測試輸出。

在相同 Docker 容器、**重新建立的上述專用假資料庫**、bootstrap 假店家／假學員就緒並套用 baseline.sql 後執行：

```sh
SPORTS_MIGRATION_REHEARSAL_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/sports_migration_rehearsal_20261018_test \
DATABASE_URL=postgresql://postgres@127.0.0.1:55438/sports_migration_rehearsal_20261018_test \
DIRECT_URL=postgresql://postgres@127.0.0.1:55438/sports_migration_rehearsal_20261018_test \
npx vitest run src/__tests__/sports-cancel-migration-rehearsal.pg.test.ts
```

測試刻意保留演練後交易供檢查，不應對演練完成的資料庫直接重跑；不提供自動清空其他資料庫的流程。

## PR 打包檢查

- Changed-file ESLint 通過。
- 未設定專用 URL 時整合測試會跳過，不連資料庫；一般 CI 不視為重做上述 19 項驗收。
- `vercel.json` 保持 main=false，另停用本審查分支；`ci-migrate.mjs` 對該分支的 Vercel／Workers／Pages 建置環境在資料庫操作前拒絕執行，三個分支標記均已驗證。此為禁止部署的預期拒絕，不以解除保護追求部署檢查變綠。
- 本 PR 不含正式 migration 登錄，也未執行 build／deploy。Cloudflare 依使用者既有指示跳過。


## PR #1349 回退版本檢查修正

up 先取得帳本表排他鎖，再檢查舊 CHECK，避免在等待鎖期間以過期定義繼續。metadata 建立後，將 `sports-cancel-migration-rehearsal:v1:<fingerprint>` 寫入 table comment 作為安裝標記。down 先對兩表持有排他鎖，再核對標記與即時計算的指紋；不符時於任何 DROP／ALTER 前拒絕。

指紋涵蓋帳本 CHECK 的物件身分、定義與 validated 狀態，以及 metadata 的表身分、owner、欄位／型別／預設值、constraints、indexes、triggers、RLS、ACL 和 policies；不包含資料列或會隨一般操作變動的統計欄位。固定 search_path 並明確使用 public schema，避免執行環境影響物件解析。這是防止誤回退的版本檢查，不是抵抗具有 schema 管理權限者偽造標記的安全邊界。

新增 11 項檢查，連同原 19 項共 30 項全部在隔離 PostgreSQL 重跑。每個漂移案例在額外外層交易中注入變更，確認 down 回傳指定的版本／結構錯誤，再由連線結束回復測試變更；原 schema 與帳本保持不變。metadata-only 與 new-ledger-only 兩項獨立驗證資料保護，不再讓其中一個先行拒絕而遮蔽另一個條件。

結果 JSON 增列此次 up.sql／down.sql 的 SHA-256，讓證據可對應實際候選 SQL。舊版 up 安裝的演練表沒有版本標記，新 down 將拒絕直接回退；本次重新建立的專用假資料庫已驗證新版 up/down 配對。不得為了通過檢查在其他資料庫手動補標記。
