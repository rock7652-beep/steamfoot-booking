> 2026/09/20 最新決策：停止額外備份匯出／Docker 還原及憑證索取，取消相關發布門檻。正式執行狀態、CI 與自動審核阻礙以 [最新發布紀錄](course-production-release-status-20260920.md) 為準。以下保留歷史證據，不再作為重複索取授權或備份憑證的依據。

# 正式備份恢復演練：缺少既有正式連線，尚未執行

## 最終盤查停點（使用者指示）

憑證盤查到此停止，不再擴大搜尋，不新增取得secrets的工作流程／程式入口。備份授權已取得，但缺少既有正式連線；尚未匯出、還原或驗證正式資料。既有空還原DB與私有限權目錄保留，沒有正式資料副本。其他不依賴憑證的發布準備繼續，剩餘工作集中見 `course-release-remaining-20260920.md`。下方保留盤點歷程，不代表持續查找。

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

## 本次授權後的實際進度

- 使用者已明確授權唯讀一致性邏輯備份及新目標恢復，不需再詢問同一授權。
- 來源唯讀盤點：PostgreSQL 17.6、37 MB；public 108 表、auth 27 表、storage 8 表、realtime 2 表、supabase_migrations 1 表、vault 1 表。public 外鍵208、RLS表106、policy0；這是結構盤點，不是資料筆數完整性驗收。
- 來源 extension：btree_gist、pg_stat_statements、pgcrypto、plpgsql、supabase_vault、uuid-ossp。目標僅plpgsql，shared_preload_libraries空；尚未套用來源extensions或job。
- 已再次核對目標 network=none、無port，指定新空DB已建立；原本3個資料庫保留。**新DB為空，不宣稱已還原。**
- 私有備份目錄700、檔案600已建立，位於Git工作區之外；尚無正式dump或個資副本。
- 具體阻礙：已知本機環境檔無正式連線；Vercel正式DIRECT_URL/DATABASE_URL皆為sensitive，不能讀回。不使用全環境下載、不重設正式密碼、不建立正式角色。
- 已詢問既有連線資料的本機私有位置；取得後先驗證ref與唯讀session，再執行匯出。這是缺少技術連線資料，不是等待備份授權。

## 清理安排

完成演練後回報本機dump、副本、臨時連線檔的確切範圍與用途；連線秘密使用後即移除，備份及還原副本依使用者確認保留期後另行清理。不刪除A店或其他使用中測試資料。現階段只有空目標及無密值模板，未產生正式資料副本。

### 既有私有設定補查結果

依使用者追加指示檢查同一Git專案已存在工作目錄的根目錄環境檔、`.vercel`／私有設定及PostgreSQL標準私有設定。共5份候選設定：目前課程連線為空、另有明確指向preview的SPA連線、原專案為localhost；沒有正式庫可用URI。`.pgpass`、`.pg_service.conf`與相關程序連線變數均未提供。只輸出目標及存在狀態，未顯示任何密值，也未拿preview密碼嘗試正式库。

仍缺正式資料庫既有密碼；Connect頁面可取得主機／連接埠／使用者及URI模板，但不能由模板取得原密碼。已提供取得模板與私有存檔步驟，未重設密碼、未修改部署設定。

### 擴大至同專案歷史來源的盤查（依追加指示）

- Git登錄168個工作目錄，101個仍存在；查找原始專案、目前及其餘現存worktree，包含忽略／隱藏env、私有連線、備份與部署腳本，共105個候選檔；掃描未回報權限錯誤。67個已不存在的目錄無法檢查內容。
- 本任務私有目錄6個文字檔未找到正式PostgreSQL URI；專案目錄未找到zip/tar/tgz或env備份候選。仍只有明確preview與localhost連線，未拿這些密碼嘗試正式庫。
- `.pgpass`、`.pg_service.conf`、程序DB環境變數未配置；Supabase CLI已知設定目錄僅telemetry，Vercel CLI有auth/config。平台登入token不是DB密碼，未讀出或轉用。
- 歷史 `docs/store-subscription-vercel-one-time-migration-plan.md` 第13–16行明記本機旧prod憑證P1000、Vercel sensitive讀回空值，改規劃由build內使用現有憑證。此文件是當時紀錄，不當成目前每次遷移都已執行的證據。
- 現有 `scripts/ci-migrate.mjs`／package build確認使用Vercel production環境與指定migration target guard；`production-migration-reconciliation.ts`讀取DIRECT_URL。
- 另一個已證實使用來源：GitHub環境 `Production – steamfoot-booking` 的DATABASE_URL、DIRECT_URL（metadata更新時間2026-08-24）；`customer-health-history-grant-migration.yml`注入這兩項。2026-08-25成功run 32813746817。僅唯讀查metadata／執行結論，沒有觸發任何工作流程。
- GitHub secrets與Vercel sensitive不能讀回明文；沒有透過部署、工作流程、日誌或artifact輸出secret的替代做法。未修改正式設定。

結論：已找到過去可用憑證的**平台保存位置與使用方式**，但尚未找到可用於本機備份的正式連線。這不代表密碼在其他未提供的密碼管理工具不存在。真正仍需補足：原憑證保管者提供現有正式DB密碼／完整URI至本機私有限權檔；Connect只提供URI模板，不顯示原密碼。不重設密碼、不重問備份授權。尚未能執行真實備份／恢復。
