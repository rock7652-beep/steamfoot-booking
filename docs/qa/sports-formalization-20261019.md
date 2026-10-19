# 運動永久固定課正式化候選

基準 main `28c469fa`（PR #1355），2026-10-19。此 PR 只交付實作、候選與靜態／mock驗證；未合併、執行任何 migration、變更環境旗標或部署。

## 已核對的正式前置現況

正式專案 qijlnhtpbintanzpxkvf：SportsStagingSessionRule、帳本、課程、預約、課卡、計酬快照存在；既有取消還點 readiness 的 schema_matches、ledger_ready、browser_blocked 均 true。課程教練／教室 exclusion constraints 已驗證。SportsPreviewScheduleSeries 與 CourseScheduleSeries 均不存在，所以不能把 Preview 的 CREATE TABLE LIKE 直接用在正式庫。

MCP 查詢角色 postgres 有既有表權限，不能當作 Vercel 應用角色證明。正式 DATABASE_URL/DIRECT_URL 仍為 sensitive，未讀取密碼。正式旗標0、店家白名單空；main自動部署false。本PR不重開備份查證，也不複製隔離站資料或帳號。

## 實作與界線

- 正式永久系列存於獨立 `public.SportsScheduleSeries`；隔離 Preview 繼續使用原表，音樂系列與cron不接入運動資料。
- 歷史helper `sportsNativePreview` 保留呼叫介面，正式端改由既有 `sportsProductionEnabled` 決定：production／main／指定repository／正式DB專案、QA旗標清空、SPORTS_REDESIGN_PRODUCTION=1及明確店家白名單。預設關閉，未改任何線上值。
- 新版頁面及運動交易入口沿用角色／店家／business.fitness資格。子店唯讀與booking.read/create/update、plans.edit、wallet.read、transaction.read、staff.manage、trial.create及計酬權限仍由原guard處理。不得用新增DB權限替代應用授權。
- 正式頁面、永久系列action及系列讀取檢查資料庫版本／有效連線角色。版本pin包含欄位、default、constraint、index、policy、owner及ACL；變動後拒絕啟用，沒有自動修復。
- 查詢的表名只能由固定常數產生，storeId仍為參數。既有Store交易鎖、重送去重、扣還點與補課券、釋放時段撞課守衛保留。

## Migration 候選與最小權限

`/scripts/sql/sports-permanent-series-candidate.sql` **不在自動migration搜尋目錄**。沒有登錄Supabase history，合併不會安裝。不得批次補跑其他migration。

候選明確建立22欄、週／隔週／時間／名額／JSON型態CHECK、store/requestKey唯一性、店家／空間／教練索引及Store RESTRICT外鍵。已存在同名表時立即失敗，不覆蓋或猜測既有版本。無INSERT資料、無音樂表依賴、無修改既有帳本。既有有限堂數課程不自動轉換為永久系列；需保留原排課與計酬歷史。

未來執行者須先在同一連線指定 `sports_migration.app_role` 為**已確認的後端LOGIN角色名稱**，不要填密碼；未設定或選到瀏覽器／非LOGIN角色會回退整筆transaction。只授予public USAGE及新表SELECT/INSERT/UPDATE，不授予DELETE或改動角色屬性。RLS啟用，PUBLIC/anon/authenticated/service_role撤權；只為指定可信LOGIN建立後端policy。應用仍必須以storeId及已授權actor限制所有查詢。

安裝後必須以正式應用連線讀取readiness；管理角色結果不能代替。此步可與單筆安裝驗收一起完成，不要求使用者更改密碼或新增公開診斷端點。

## 回退與緊急收斂

**有正式系列資料後，禁止直接關閉總旗標、移除店家白名單或回退到不認識永久系列的舊程式。** 這會忽略尚未展開占位、零預扣名單及補課權益。

1. 緊急時保持新版核心與白名單，經另行授權將 `SPORTS_PERMANENT_CREATION_PAUSED=1`。新增固定系列在原transaction內拒絕，先前產生的課程也隨transaction回退；既有展課、點名、調課、取消與補課維持原守衛。
2. 暫停新增不是全站唯讀，也不停止現有系列展課。修補後走同一版本的前向修復；不要用刪表或刪帳本止血。
3. 若決定完全退出，先以新版本停止所有試點店的未來系列，核對已生成課次、預約、扣還點、未用／已用補課資格及歷史更正需求。仍需歷史更正時保留能處理其資料的新核心，不能宣稱可安全切回舊核心。
4. 候選未使用／旗標未開時可取消部署計畫並保留空表；即使空表也不提供自動DROP。已有資料則保留表、RLS、權限及審計，不刪除或遷回Preview。DDL物理移除須另做相依與版本審查，另行授權。

## 最短上線順序（全部待授權）

審查本PR → 授權隔離DB演練候選及非owner LOGIN權限/版本變動拒絕 → 審查演練結果 → 合併（正式部署仍停用） → 確認首批fitness店家及真實應用LOGIN → 授權單筆安裝並以應用連線唯讀驗證 → 授權新版關閉狀態的正式部署 → 授權僅首批店家啟用 → 專用會員驗證排課、扣還點、調課、停課補課與跨登入同步。

## 本PR證據限制

SQL候選只有離線PostgreSQL語法解析，未連線執行／演練；正式授權與表選擇、readiness拒絕及交易回歸以mock測試。沒有新增Preview或正式部署；既有介面實測證據可參考 PR #1355 的 `docs/qa/sports-main-integration-20261019.md` 與 artifacts（非此正式候選的線上驗收）。尚不能宣稱新表、非owner RLS或正式角色在實際DB已驗收。此為候選審查PR，非上線放行。

本機驗證：11檔96項功能／回歸，加上獨立4項部署拒絕tripwire，共12檔100項通過；TypeScript noEmit、變更來源ESLint及diff檢查通過。PostgreSQL候選12個SQL敘述、2個PL/pgSQL DO區塊，以及readiness單一SELECT通過離線解析。日誌在 `artifacts/sports-formalization-20261019/`。此結果不等於實際DB角色、RLS或migration演練成功。

## 隔離演練補充（2026-10-19）

已完成原候選 `7d4ea42c` 的 PostgreSQL 16.15 隔離演練：51 項實際 DB 檢查、19 組實際結果經原 verifier 驗證及 100 項程式回歸測試通過。包含非 owner LOGIN、瀏覽器拒絕、DDL 整筆回退、版本／權限異動拒絕與停止日期回退。完整報告、合成 SQL transcript 與重現腳本見 `artifacts/sports-formalization-rehearsal-20261019/README.md`。此補充取代前述「尚未隔離演練」的狀態；前述原始提交的證據界線仍保留作為歷史紀錄。

正式應用連線、完整正式 schema 與瀏覽器真實交易不在本次演練範圍；未執行正式 migration 或部署，亦未更改運動新版線上旗標。
