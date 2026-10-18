# 運動正式啟用與必要權限

本 PR 從 main@58e27414 製作。預設不啟用、不合併、不執行 migration、不部署；不改權限、正式環境變數或 migration history。備份已依使用者提供的每日備份紀錄結案，不新增 PITR 工作。

## 最終行為

- 獨立正式旗標 `SPORTS_REDESIGN_PRODUCTION=1` 與 `SPORTS_REDESIGN_STORE_IDS`（逗號分隔實際店家 ID，禁止萬用字元）。未設定即關閉，只接受固定 repo 的 Vercel production/main、正式 Supabase project 的 DATABASE_URL／DIRECT_URL，且舊 QA 旗標必須移除。原本 localhost／指定隔離 Preview 邊界不放寬。
- 指定店家的 `/dashboard/courses` 使用既有運動工作區。須有 booking.read 及 plans.edit／customer.read／wallet.read／transaction.read；權限較少的員工保留原課表。後端沿用 courseManager／courseMember、已驗證 storeId、fitness entitlement 與每項操作原權限，不授予新員工權限、不信任前端店家 ID。
- 指定學員／開放選課、收費、體驗及排課核心均帶入授權店家檢查。關閉新 UI 或移除店家白名單後，預約核心與會員課表仍讀取已存在的 metadata，保留指定學員限制；固定課原位置的系列辨識也不依 UI 開關消失。
- 應用以自己的實際連線，唯讀核對安裝指紋、已 validated 的新 CHECK、瀏覽器禁止存取、當前角色的 schema USAGE／新表 CRUD 及 owner／BYPASSRLS。缺表、權限或版本不足即拒絕，絕不自動 migration／GRANT，也不要求貼密碼。
- `node scripts/sports-production-preflight.mjs` 是僅供管理者手動執行的唯讀自查，沒有接到 build/start。只接受已識別的正式環境；在 READ ONLY transaction 中回報 current_user／session_user 與 ready。缺表時仍可回報角色及 ready=false，不輸出連線字串／客戶資料。此 PR 未在正式環境執行它。
- 正式顯示實際店名，移除測試站提示及測試稽核理由；其餘五種排課、固定課淡化、交易核心與 15 秒輪詢維持既有設計。
- 延續指定店家試行：課次、出租、顧客超過 500 筆工作區容量時明確拒絕，不再默默截斷。未宣稱完成大量資料擴充。
- main 與本審查分支的 Vercel Git 部署保持停用；ci-migrate 對本分支在任何 DB 工作前拒絕建置。

## 驗證與範圍

- 147 項／8 檔啟用邊界、必要權限、舊 QA 隔離、排課重送／既有介面回歸及正式標示測試通過，見 `artifacts/sports-production-enable/tests.log`。
- 實作過程曾對既有本機隔離庫執行 READ ONLY catalog／權限檢查：role=postgres、ready=true，未執行 migration 或交易。環境切換後修改已還原至持久工作區並重跑上述測試；不宣稱這是正式角色驗證。唯讀查詢邏輯與先前檢查相同，僅重新格式化程式碼。
- 桌機／iPad 尺寸的獨立靜態呈現預覽與溢出檢查，見同目錄 PNG 與 presentation-checks.json。使用當前 component 及既有本機編譯 utility CSS；這是靜態元件呈現，不是正式部署、實體 iPad／Safari／LIFF 或完整業務操作驗收。
- 交易與資料庫演練沿用 PR #1348／#1349 已驗收核心；本次沒有重跑 migration、扣點／還點或正式跨裝置交易。正式更新後仍須另經授權驗收。

## 子店唯讀回歸修正

- 正式新版入口先核對本店操作範圍；OWNER 查看子店時沿用原課表，不呼叫寫入範圍的 `loadSportsStaging`。ADMIN 的已授權店家及本店操作路徑維持原檢查。
- 新增 5 項實際頁面函式測試：子店課表可讀、課程／租借操作均關閉、本店 OWNER／ADMIN 新版入口、權限不足員工保留原課表，以及後端拒絕不繞過。
- 同一測試在修正前可重現 1 項失敗（另 4 項通過）；修正後連同正式啟用、呈現、原空間頁與 HQ 權限回歸共 46 項／5 檔通過，見 `child-view-before-fix.log`、`child-view-tests.log`。
- 此次只修正伺服器頁面的入口選擇，不改版面、CSS、交易 Action、資料庫角色或 migration。沿用既有桌機／iPad 呈現證據；新增驗收是 mock 資料的伺服器頁面測試，未宣稱瀏覽器或跨裝置完整操作驗收。

## 最短執行順序（現在不執行）

1. 審查此 PR 與非 Cloudflare CI。
2. 在授權環境以唯讀 preflight 確認實際應用角色；先決定是否需要最小權限調整。若需要 GRANT，須另審，且在安裝指紋捕捉前完成，不能移除 RLS 或開放 anon／authenticated 來通過。
3. 另經授權執行 PR #1350 的單筆 migration，不批次補跑 22 項歷史差異；核對版本與資料保留。
4. 指定一間具 fitness entitlement 且資料量可完整載入的店家，移除舊 QA 旗標、設定新正式旗標／店家 ID。此 PR 不預填、不更改 Vercel 環境變數。
5. 另經授權部署；實際角色／schema readiness 通過後，完成指定店家的排課、預約、出席、取消及兩端不重整同步驗收，再決定是否擴大。
6. 關閉新旗標可回到舊介面，但保留新表／帳本與既有預約限制；是否能 down 仍依 #1350 的版本、指紋、資料保護判斷，不刪帳或手動還點。
