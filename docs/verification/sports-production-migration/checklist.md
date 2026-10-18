# 正式資料庫前置核對與上線清單

> 此表保存 PR #1349 合併後的唯讀快照。後續本 PR 已在 repository 登錄正式 SQL，並附上逐項差異處理方案；尚未套用正式資料庫。以 release-manifest.json 識別本次檔案與執行狀態。

核對時間：2026-10-18 09:54–09:56（Asia/Taipei）。來源：main `c0fa70ba907a4e90a0927f14eb0fca4fa50db321`，PR #1349 已合併。

本次正式資料庫查詢全數以 `BEGIN READ ONLY` 執行 SELECT，另讀取 Supabase project／migration metadata；未執行 migration、DDL、DML、seed、build、部署或旗標變更。沒有讀取顧客姓名、聯絡資料、逐筆交易或連線密鑰。

## 結論

**正式庫符合 PR #1349 候選 SQL 的主要結構與帳本前置條件，可開始製作正式 migration PR；尚不能直接執行 migration 或啟用新版運動介面。**

仍需完成：正式 migration 登錄與審查、22 個 Prisma 紀錄差異釐清、可用備份／復原點確認、正式應用角色與新版啟用方案。這些是後續執行關卡，本次沒有代為執行。

## 已核實的條件

| 項目 | 正式唯讀結果 | 判定 |
| --- | --- | --- |
| 目標 project | steamfoot / qijlnhtpbintanzpxkvf，ACTIVE_HEALTHY，東京區 | 目標相符 |
| PostgreSQL | 17.6 | 已記錄版本 |
| 舊帳本 CHECK | 存在且 validated | 通過 |
| CHECK expression MD5 | acff8c4c1a3c1701a7415f896b058364 | 與候選 up 的預期完全相符 |
| 帳本／卡片 | 16 筆／2 張卡 | 無新增歷史格式差異 |
| 非正點數／NULL／舊格式以外的帳本 | 全部 0 | 通過 |
| 新取消更正／CANCEL_SOURCE 紀錄 | 全部 0 | 正式尚無這些新格式 |
| 已取消學員／團體請假預約 | 0 | 只代表本次未觀察到此狀態 |
| SportsStagingSessionRule | 不存在 | 符合 up 建表前置條件；目前無法執行新版 down |
| CourseRental | 存在 | 空間出租既有表已存在，非本次新建範圍 |
| 父表 id、storeId | CourseSession／CoursePointPlan 均為 text、NOT NULL | FK 欄位相容 |
| 父表 (id,storeId) unique index | 兩者皆 unique、valid、ready | FK 必要索引通過 |
| anon／authenticated／service_role | 都存在 | REVOKE 所需角色存在；不代表已驗證正式 app 寫入權限 |
| 帳本與索引大小 | 65,536 bytes | 僅本次快照，不保證執行時的鎖定時間 |
| 目標表待取得鎖 | 查詢時 0 | 執行前須重查，不是零等待保證 |
| 正式 Prisma migration 紀錄 | 138 列、122 個已完成且未回退名稱；未完成且未回退 0 | 目前沒有未完成／未回退 migration |
| 正式 Supabase migration 紀錄 | 94 筆；最新 20261013141636 / booking_participants_companion_removal | 與 Prisma 為兩套紀錄，不能混為一談 |
| 新候選正式登錄 | 候選名稱查無相應紀錄，且 repository 仍放在 scripts/qa | schema 未套用；不是正式 migration 已完成 |
| 部署設定／應用入口 | main 的 Vercel Git deploymentEnabled=false；sportsStagingEnabled 仍只接受 localhost QA／指定隔離 Preview | 維持停用，不能直接把測試旗標搬至 production |

完整 CHECK 定義、各索引與彙總數字見 `readiness.json`；本次主要唯讀 SQL 見 `read-only-check.sql`。

## 需先處理的 migration 紀錄差異

main 有 144 個 Prisma migration 檔案，其中 **22 個名稱不在正式「已完成且未回退」Prisma 紀錄中**，清單見 `migration-comparison.json`。包含月結／通知、音樂請假、空間出租、共享標籤、自主預約等項目。

這是「紀錄未對齊」，**不等於 22 個 schema 都缺失或都應重跑**：例如 CourseRental 目前已存在，相關變更也可能由 Supabase migration 或其他已核准流程處理。必須逐項對照實際 schema、checksum 與兩套 history，決定哪些需要獨立修復／登錄。不得直接以 `prisma migrate deploy`、build 或全量 pending migration 作為此次上線方式，也不得未經證據就批次標記 applied。

## 尚未證實，執行前必須完成

- Supabase 可用備份／PITR 復原點、保留期限及實際可復原性：本次連線未提供此證據，不能宣稱已備妥。記錄明確時間與復原程序；不以一般資料庫回復取代交易回退規則。
- 正式 migration 的檔名、版本、內容 SHA-256、唯一執行路徑與 executor：候選尚未正式登錄，不執行 QA baseline.sql 或 seed。若採 Supabase migration，須同時說明與 Prisma 紀錄的管理界線。
- 正式應用實際連線角色對新表的權限：新表尚不存在，現在無法驗證 SELECT／INSERT／UPDATE／DELETE。正式 SQL 須明確設定 server 所需權限，並在捕捉安裝指紋前完成；瀏覽器 anon／authenticated 維持不可直接存取。
- 正式啟用程式：目前明確拒絕 production，需另行審查正式入口、店家 entitlement、開放範圍與 schema readiness。不能繞過 Preview 邊界。
- 舊課程／固定系列的呈現與資料相容性：不得推測指定學員／開放選課或自動回填。每週／隔週課異動後原位置只淡化提示後續系列，該次時段仍可排；其他一次性課不淡化。

## 上線執行清單（規劃，現在不執行）

| 順序 | 執行事項 | 完成／放行條件 |
| --- | --- | --- |
| 1 | 製作正式 migration PR，附上 up／受保護 down、30 項演練、雜湊與權限設計 | 單獨審查通過；處理上述 migration history 差異，確認僅執行核准項目 |
| 2 | 確認備份／復原點、執行者與受影響交易入口的暫停／維護安排 | 備份證據可核對；有明確負責人、時間與停止程序 |
| 3 | 在執行當下重跑唯讀 preflight，保存原 CHECK／指紋、帳本基準與目標 project | 指紋仍相符、metadata 仍不存在、沒有未完成 migration；其他差異均已釐清 |
| 4 | 取得明確授權後，僅執行該筆已審查正式 migration | 保留單一 transaction、lock_timeout=1s、statement_timeout=15s；先持鎖再驗指紋。遇錯誤整筆回滾，不放寬限制、不跳過指紋、不改走批次部署 |
| 5 | migration 後唯讀核對 | 新 CHECK validated；安裝版本／指紋相符；metadata 欄位、FK、索引、RLS、ACL 正確；既有帳本、卡片餘額與預約與受控基準一致。若有正常並行交易，必須先依交易紀錄對帳，不能只用列數猜測 |
| 6 | 另行審查並授權正式應用啟用／部署 | 先完成隔離測試站驗收；以指定驗收店執行已授權的排課、預約、出席、取消及跨裝置流程。不要用真實客戶帳目當測試資料 |
| 7 | 部署後驗收與有限開放 | 五種排課類型、指定學員／開放選課、固定系列淡化、預約／扣點／還點與不重整同步通過；重送／並行不重複扣還，補課券已用時拒絕取消 |

**migration 與正式部署是兩個獨立授權動作。** 合併正式 migration PR 不等於授權執行；migration 成功也不等於授權開啟正式介面。本次不更改 main 自動部署設定。

## 停止與回退條件

- project 不符、原 CHECK 漂移／未 validated、新表已存在、history 不明、備份未確認、角色權限不明或鎖逾時：停止，不以重跑／放寬檢查排除。
- transaction 尚未 commit：任何失敗整筆 rollback，保留舊 CHECK 與既有資料。
- 已 commit，但**安裝版本與結構指紋仍相符、沒有新格式帳本、metadata 空表**：在停止相關寫入並獲授權後，才可執行同版本 down。
- 有新格式交易、metadata 資料或結構漂移：down 必須拒絕。先關閉入口／回退經驗證的應用版本，保留擴充 schema 與歷史資料，另提向前修正。
- 不刪帳本、不手改餘額、不硬縮回舊 CHECK、不移除安裝標記或偽造指紋。若舊版演練 up 沒有安裝標記，新 down 會拒絕；不得人工補標記繞過。

## 本次交付

完成唯讀前置核對與執行清單。下一個具體工作是**建立正式 migration 審查 PR，連同 migration history 差異處理方案**；正式 migration 與部署繼續停用。
