# 課程資料庫更新方案與隔離演練

狀態：遷移 SQL 的本機隔離演練通過；**尚未授權或執行正式更新**。LINE 實機登入、四個會員分頁與 Logo 已由使用者確認通過；剩餘發布前缺口以 course-premerge-review-20260916.md 的最新狀態為準。本文件不包含連線資訊、帳號、店家或交易資料。

## 正式環境唯讀盤點

2026-09-16 查詢系統目錄，沒有讀取顧客或交易內容：

- PostgreSQL 17.6；`btree_gist` 已存在。
- `IndustryModule` 只有 STEAMFOOT、SPA；沒有 Course 資料表。
- Staff 缺少本輪電話／緊急聯絡人三欄，StaffMemberLink 缺少 courseMemberEnabled。
- Store、User 主鍵存在；Staff、Customer 的 `(id, storeId)` 唯一索引存在，可供複合外鍵參照。這些相依表已啟用 RLS。
- 兩套遷移歷史均未記錄下列課程遷移。public 未設定 default ACL；演練仍額外模擬較寬鬆的瀏覽器預設權限。

## 必須採用的相依順序

不能合併兩個目錄後按時間排序：categories 的時間早於建立 CourseRoom，但實際依賴它。

1. Prisma `20260915090000_add_course_scheduling`
2. Prisma `20260915140000_course_points_booking`
3. Prisma `20260915150000_course_coach_member_mode`
4. Supabase `20260915082019_course_catalog_categories`
5. Supabase `20260915123055_course_catalog_details`
6. Supabase `20260916024857_course_attendance_and_staff_contacts`
7. Supabase `20260916090234_course_portal_integration`

原始 SQL 沒有改寫。檔案 SHA-256、執行引擎與結果見 `course-migration-rehearsal-20260916.json`；重跑程式會重新計算來源檔案雜湊，發布前必須與此紀錄比對，不能只確認名稱。

## 可重現的隔離驗證

腳本：`scripts/course-migration-rehearsal.py`。只允許指定本機 Docker context 與 container；不接受資料庫 URL，會拒絕開啟網路、發布埠或主機掛載的容器。測試使用 PostgreSQL 17.6 的一次性資料庫，結束即移除該次資料庫。

建立獨立 Colima profile（不切換使用者預設 context）與容器後執行：

```sh
colima start course-release-audit --activate=false --cpu 2 --memory 2 --disk 10 --mount none
docker --context colima-course-release-audit run --name course-release-pg --detach --network none -e POSTGRES_PASSWORD=disposable-course-audit postgres:17.6
python3 scripts/course-migration-rehearsal.py
```

上述密碼僅用於不開放網路的一次性本機容器，不是任何環境的登入憑證。若同名資源已存在，先確認來源，不直接覆蓋或重建。

實際通過：

- 七份 SQL 依序置於同一個交易內，提交成功，建立 10 張 Course 表，RLS 均啟用。
- 最後一份完成後、COMMIT 前故意失敗：新表、COURSE enum 值及既有表新增欄位全部回復。
- 缺少 Customer 複合唯一索引時失敗，前面已執行的 DDL 全部回復。
- 重跑／已有部分 Course 表時先停止，不以忽略錯誤或 IF NOT EXISTS 掩蓋不同版本。
- 原有合成蒸足／SPA 店別、身分連結、顧客及營運結果快照不變；新欄位預設值正確。
- 負點數、跨店共卡成員、同學員重複有效預約、教室撞期、教練撞期均被資料庫阻擋。
- NO_SHOW 與點名更正異動格式可寫入。
- 模擬 anon／authenticated 有寬鬆預設表權限時，RLS 仍阻擋直接讀取點數卡與新增教室；購買表權限已撤銷。

**範圍限制：**這是依已核對前置結構建立的合成相依基底，不是正式資料庫完整複本，不驗證正式資料量下的鎖等待、PITR 備份還原、雲端角色差異，亦不替代應用程式的預約／付款驗收或既有 `postgres-integration` CI。後者已開放課程分支，PG17.6 隔離 CI 實跑 32 項全部通過、零跳過（run 35116385976）；兩者證據互補。

## 取得明確上線授權後的執行順序

1. 固定核准提交及上述七份雜湊；保留當前正式應用版本。確認可用備份／還原點與操作權限，使用非營業尖峰維護時段。尚未驗證正式備份還原，不能宣稱已演練。
2. 再做唯讀盤點：伺服器版本、相依欄位型別、複合唯一索引、extension、兩套歷史、Course 表及共享欄位。任何部分套用、校驗碼差異或漂移均停止，逐項釐清；不能直接執行整包 `migrate deploy` 或 `db push`。
3. 保持既有店家模組值與功能開關不變。在單一連線取得維護鎖，使用已演練的 BEGIN／七份 SQL／COMMIT 順序，設定 `lock_timeout=5s`、`statement_timeout=60s`。不得在交易提交前使用新增 enum 建立店家。鎖等待超時即退出，不能無限等待。
4. 提交後先核對完整結構、外鍵、檢查條件、兩個 exclusion constraints、10 張表的 RLS、瀏覽器角色權限及既有店家不變，再以各自管理工具只登錄上述三個 Prisma／四個 Supabase 的已完成歷史。歷史寫入機制尚未在完整雲端複本演練；實際執行前必須核對工具版本／指令與紀錄內容。不把其他 pending migration 標為完成。
5. 若結構已成功但登錄中斷，保持功能關閉；下次只做唯讀核對及修復歷史，禁止再執行 DDL。本輪沒有增加 production migration allowlist 或自動執行入口。
6. 在上述核對成功及使用者授權後才發布核准應用版本、開放指定課程店家，做少量核准的正式冒煙檢查。現有蒸足／SPA 店家不轉換模組。

## 失敗與回復

- COMMIT 前失敗：ROLLBACK，已在 PG17.6 實測；查清失敗原因再重試。
- COMMIT 後應用有問題：保持／回復原應用版本並關閉課程入口，保留新增結構及資料。不得 DROP 表、刪除 enum 或回灌整庫來覆蓋期間的蒸足／SPA 交易。
- 若發現資料完整性問題，暫停受影響的課程操作，使用獨立恢復副本分析與可稽核的修正；任何正式修復仍須明確授權。

參考：[Supabase migration 指引](https://supabase.com/docs/guides/local-development/database-migrations)、[環境管理](https://supabase.com/docs/guides/deployment/managing-environments)。本輪沒有修改正式資料庫、正式部署或合併。


## 發布準備收尾核對（2026-09-16）

- 再次唯讀查詢正式系統目錄：PG17.6、btree_gist 1.7；Course 表及七筆遷移歷史仍不存在；Staff 三欄、StaffMemberLink.courseMemberEnabled 仍缺少。相依複合唯一索引仍存在。
- 七份 SQL 的 SHA-256 全部與既有演練紀錄一致；沿用原子提交、失敗 ROLLBACK 及 RLS 證據，沒有重跑已通過演練。
- 沿用 SPA 發布任務「盤點 SPA 模組上線前項目」的備份查核方式。本次登入管理台唯讀確認七份 COMPLETED 實體備份；最新為 **2026-09-16 01:26:58 Asia/Taipei**，舊 SPA 證據中的 2026-09-14 01:24:13 備份亦仍列出。COMPLETED 是備份完成，不是還原完成。
- PITR 頁面顯示尚未啟用附加方案。Restore to new project 有可用備份入口，但沒有可引用的已完成還原紀錄；本輪未按 Restore、未啟用付費功能或建立正式資料複本。不能宣稱 PITR／完整雲端還原已驗證。
- 沒有找到可沿用的實際還原成功證據。日備份不涵蓋該備份之後的交易，不能作為直接覆蓋正式庫的回退方案。預設回復仍為交易內 ROLLBACK，或提交後回退應用、保留新增結構與資料。

### 合併與部署必須分開安排

目前 `npm run build` 會先執行 `scripts/ci-migrate.mjs`；課程三份 Prisma migration 不在正式 pending allowlist。**不能現在直接合併並期待正式部署自動完成課程更新。** 不擴大 allowlist 來繞過此保護。

需使用者核准本文件的維護窗口後，先按上列 1–5 步完成精準 DDL 與兩套歷史核對，再核准合併／正式發布。這是待授權的正式操作，不是本輪已完成項目。若要先合併，須先有明確且已核對的正式自動部署暫停安排，不能假設合併不會觸發部署。

歷史登錄只允許上述三個 Prisma 名稱與四個 Supabase 版本。使用固定 lockfile 的 Prisma `migrate resolve --applied <完整名稱>`，Supabase `migration repair <版本> --status applied`；必須在已核對的正式連線／project 範圍執行，不可依賴目前 CLI 預設連結。Prisma 登錄後核對名稱、checksum、finished_at、rolled_back_at；Supabase 核對 version/name。單筆中斷只補缺少且結構一致的歷史，絕不重跑七份 DDL。此工具登錄步驟尚未在正式完整複本演練，保留為發布限制，不將本機 SQL 演練冒充該項證據。

## 2026-09-17 新增退款遷移（尚未授權正式執行）

原七份遷移之後需追加 `supabase/migrations/20260917000515_course_purchase_refunds.sql`：
CoursePointCard.closedAt、購買 REFUNDED 狀態、不可覆寫的 CoursePurchaseRefund、REFUND 額度異動。
完整八份的來源雜湊及 PostgreSQL 17.6 本機隔離演練結果，見 `course-refund-migration-rehearsal-20260917.json`。
本次同樣驗證整批 DDL 失敗全回滾、缺依賴／重複／部分套用拒絕與 RLS；不是正式備份還原或真實退款交易驗收。

只將新檔套用到既有隔離預覽庫；正式資料庫、正式 CI 遷移 allowlist 均未更動。
回復：未提交的八份 DDL 整批 ROLLBACK；已提交但尚未有退款可回退應用版本並保留新增欄表。
一旦存在退款資料，禁止 DROP 表／恢復剩餘額度／刪除退款現金帳來回復；須保留帳本並以向前修復處理。
既有備份證據只限當時資料時間點，不宣稱覆蓋新退款資料；正式執行仍需使用者確認及當次可用備份。

同日再追加第九份 `supabase/migrations/20260917002754_course_purchase_corrections.sql`，承接交易備註、歸屬與誤建作廢。完整九份演練雜湊見 `course-corrections-migration-rehearsal-20260917.json`。新增作廢欄位与同店人員外鍵，不回填或改既有交易。作廢保留原訂單、額度收回與原記帳日的非現金沖銷，不冒充實際退款；已發生作廢亦只允許向前修復，不得刪除歷史。

第十份 `supabase/migrations/20260917011137_course_customer_emergency_contacts.sql` 以 nullable 欄位補上 Customer 緊急聯絡姓名／電話，不回填、不更動身分連結。完整十份 PostgreSQL 17.6 本機演練雜湊與結果見 `course-contacts-migration-rehearsal-20260917.json`。預览只讀 schema preflight 已納入欄位檢查；正式 allowlist 不變。正式部署前須先依序完成十份 DDL 及相符遷移歷史，未獲授權前不得執行。回退應用時保留新欄及已填資料；不得以 DROP COLUMN 作回復。
