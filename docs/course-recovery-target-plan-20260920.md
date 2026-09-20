# 正式備份恢復目標盤點（2026-09-20，尚未執行）

## 現有資源與結論

- Supabase 僅有 `steamfoot` 正式庫與 `steamfoot-preview` 使用中的隔離庫。沒有可直接覆蓋的閒置雲端目標。
- 本機既有 Docker context `colima-course-release-audit`、容器 `course-release-pg`（PostgreSQL 17.6），network=none、無對外 port。現有 postgres、course_release、course_batch2_rehearsal 不覆蓋。
- 提議另建空資料庫 `course_prod_restore_20260920`，不新增雲端／付費資源；確認前不建立、不匯出正式資料。

## 必須區分的兩種證據

1. Supabase 排程 PHYSICAL 備份：前次唯讀所見最新為 2026-09-19 17:23:31 UTC（台灣9/20 01:23:31）。未恢復。
2. 提議唯讀取得新的正式一致性邏輯備份：實際開始／結束時間、雜湊、schema與資料範圍於執行時記錄，不能冒稱是上述PHYSICAL備份。

Supabase 的 Restore to a new project 會新增付費運算資源；二進位恢復也會帶回可外連的extension/job，不能符合本輪不新增付費資源及事前阻止外發要求。Physical不可直接下載的情況下，不能假稱可把該檔匯入本機。依官方文件，手動logical restore可先檢查排程與外發定義；Vault root key及Storage objects不在此方案內。

## 待核准範圍

- 來源：正式庫僅唯讀一致性匯出。資料可能包含顧客個資、帳號／雜湊、營運交易及會員關聯；不輸出到對話或公開Git。
- 目標：上述本機新資料庫；檔案owner-only、目錄700／檔案600，僅本機帳號與演練程序使用，沒有公開網址。
- 權限：來源只需dump所需SELECT／catalog權限；目標本機管理權建立新DB及還原結構。不重設正式密碼、不修改正式schema／資料。
- 無外發：container network=none；不啟動pg_cron、pg_net、外部FDW或通知worker；應用驗證只接本機副本，LINE／Email使用拒絕發送adapter。不能把正式環境變數整份搬入。
- schema／extensions／角色先盤點；無法重建的extension、加密欄位、Auth配置、Storage實體檔案分開列限制，不忽略匯入錯誤冒稱完整恢復。
- 保留與清理：驗收前保留可追溯證據；副本／dump後續刪除另確認，不任意清理使用中的資料。

## 執行後通過標準

1. 備份雜湊、來源時間與新目標核對；匯入錯誤為零或有明確不可恢復範圍。
2. 各業務表筆數與一致性snapshot對照；帳號→店家／會員、方案→持卡人、預約→課次／顧客、交易→收支等關聯及孤兒檢查。
3. 索引、約束、RLS與角色權限可讀／拒絕結果；跨店查詢不得放寬。
4. 在副本執行必要登入／業務讀取及可回滾的預約、取消、收款／退款一致性檢查，無外發。正式尚無課程模型，課程15份遷移可另於副本演練，不宣稱既有正式課程交易存在。
5. 記錄實際dump／restore／驗證耗時；不將匯入成功當作RTO或完整功能恢復通過。
6. 正式庫與A店僅唯讀比對、無修改；發布仍另需正式批准。

參考：
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/clone-project

已集中向使用者請求一次確認；尚未取得答覆前，只完成盤點及可審查方案。
