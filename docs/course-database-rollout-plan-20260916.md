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

**範圍限制：**這是依已核對前置結構建立的合成相依基底，不是正式資料庫完整複本，不驗證正式資料量下的鎖等待、PITR 備份還原、雲端角色差異，亦不替代應用程式的預約／付款驗收或既有 `postgres-integration` CI。後者因 workflow 僅針對 `fix/test-audit-recovery` 執行，在本 PR 為 SKIPPED。

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
