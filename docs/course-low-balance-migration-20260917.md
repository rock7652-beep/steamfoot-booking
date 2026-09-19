# 課程低可用額度提醒：隔離遷移確認

目標僅為 `steamfoot-preview`，project ref `ttworfzgwejdeolegkxl`。正式專案 `qijlnhtpbintanzpxkvf` 不得修改。

待套用檔案：`supabase/migrations/20260917094700_course_low_balance_reminders.sql`。

- `CoursePointPlan` 新增 `lowBalanceEnabled=false`、`lowBalanceThreshold=NULL`，既有方案均不啟用。
- 新增課程專用接收偏好表 `CourseBalanceReminderPreference`：店家、顧客、停止時間、最後變更时间。店家／顧客複合外鍵及唯一性防止跨店與重複資料，RLS 開啟並撤銷匿名／瀏覽器角色權限。
- 不刪除或更新任何既有預約、方案餘額、會員連結、退款、交易資料；不觸發通知。
- 2026-09-17 唯讀核對：目標為 ACTIVE_HEALTHY 的 steamfoot-preview，新欄位／偏好表均未存在；當時 3 方案、8 卡、21 預約。執行前再次確認，筆數可能因已授權的本輪新交易增加。

## 證據與回復

本機無網路、无掛載的 PostgreSQL 17.6 容器完成13份遷移順序、整批失敗回滾、舊資料保留、RLS／跨店／未設定不啟用及非法門檻限制；JSON 見 `course-low-balance-rehearsal-20260917.json`。這是資料庫隔離驗證，不是真實網頁驗收。

部署前讀取新欄位及偏好表，不齊全即停止建置。

回復優先退回前一程式預覽版本，保留新增相容欄位及接收偏好（尤其是停止接收紀錄）；原程式不引用它們。若另獲准移除 schema，須先匯出偏好資料與每方案門檻，再執行對應 DROP，不能直接丟棄退訂紀錄。本輪不執行破壞性回復。

## 授權狀態

使用者已明確授權本輪低餘額新增測試遷移。再次確認目標 steamfoot-preview / ttworfzgwejdeolegkxl、ACTIVE_HEALTHY，欄位及偏好表尚未存在後，透過 apply_migration 成功套用。遷移前後均為 3 方案、8 卡、23 預約；既有方案 lowBalanceEnabled=false、threshold=NULL，偏好表 RLS=true，anon SELECT 與 authenticated UPDATE 均無權限。未執行正式遷移，未發送通知。程式部署與實際操作驗收另記於承接對照表。
