# 課程體驗隔離遷移計畫（已套用指定隔離庫）

使用者已確認收款與出席分開。本文件只涵蓋 `steamfoot-preview` (`ttworfzgwejdeolegkxl`)，不包含正式專案。

## 具體內容

檔案：`supabase/migrations/20260917143018_course_trial_separate_payment_attendance.sql`。

- CourseBooking 新增 bookingKind（原資料預設 CARD）與 nullable trialPrice；cardId 改允許 NULL，但資料庫檢查限定 TRIAL 才能無卡、額度固定 0。原 CARD 仍必須綁卡且額度大於 0。
- 新增 CourseTrialPayment，付款與出席各自存放；同店請求鍵唯一、同預約最多一筆有效收款、金額／作廢一致性約束。同店複合外鍵阻擋錯店連結。
- 收款、更正、Cashbook 及 AuditLog 在同一個店鎖交易；更正保留原作廢紀錄，不刪舊單。既有卡、餘額、占用與預約不回填改寫。
- 新表啟用 RLS，撤銷 anon/authenticated 直接權限，仍使用既有伺服器授權，不新增公開存取政策。
- 執行前核對 project ref、現有欄位／表、筆數與約束；已套用則只驗結構，不重跑 ALTER。

## 順序及回復

1. 完成本機真實 PostgreSQL 遷移與交易測試。
2. 僅取得本檔隔離遷移授權後，對預覽套用；正式庫不連線。套用在 BEGIN/COMMIT 內，失敗整筆回滾。
3. 核對舊資料筆數、卡餘額、占用不变，以及新約束／RLS／直接存取權限，再部署相符程式。
4. 尚無任何 TRIAL 預約／付款前，可在交易內以檢查拒絕條件確認無體驗紀錄，再移除空的新表／欄位並還原 cardId NOT NULL 與舊檢查。
5. 已有體驗測試歷史後，不刪資料、不退回無法讀 NULL cardId 的舊程式；關閉體驗新增開關並採前向修復，仍可查看及處理既有紀錄。若須完整復原，使用隔離備份還原到另一個隔離目標核對，不能覆蓋使用者後續測試資料。

本機測試及遠端驗收結果將另補，不以本文件視為已套用或完成。

## 隔離套用核對

已取得本檔明確授權，核對專案名稱 steamfoot-preview、ref ttworfzgwejdeolegkxl、狀態 ACTIVE_HEALTHY 後，透過 Supabase 遷移介面套用成功。

舊資料前後逐表排序計算摘要（預約排除本次新增兩欄）：

| 資料 | 筆數 | 套用前後相同摘要 |
| --- | ---: | --- |
| 預約 | 27 | 9b5ff45ba4e68bb8302fe6853b7d75be |
| 卡片 | 10 | 0c05e79a6f8552df281c284e3c59450f |
| 額度異動 | 69 | a1087d76c556f161702bfc6b77191363 |
| 購買 | 5 | fe2b6f26ff42b8b11fcd57b92029a2cf |

這只證明遷移保留既有資料；新程式部署與網頁交易驗收尚待完成，不視為整輪通過。
