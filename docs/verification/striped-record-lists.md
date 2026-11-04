# 全站條列清單交錯底色

使用者 2026-11-04 確認：白底／極淺暖灰交錯，保留目前緊湊字級、列高及操作；顧客管理、營收、月結等清單全站統一。這輪不變更開店引導完成／隱藏條件，使用者對該入口的詢問僅做讀取說明。

## 共用實作與範圍

`globals.css` 的 component layer 使用低 specificity `:where`，只有標示 `data-striped-list` 的表格與 `admin-striped-row` 的非表格紀錄列套用。正常列白底 #ffffff／淺底 #f5f3ee，hover #ece8df，原有 warning／inactive utility 底色與 aria-selected 優先。固定操作欄繼承整列底色，不留下獨立白格。搜尋／排序／換頁按目前 DOM 順序交錯，hidden 列與分組／colSpan 提示列不計數。

- 共用 DataTable → 四模組顧客管理、營收及其他使用入口。顧客原有批次勾選狀態透過 aria-selected 提供整列辨識，選取不被 hover 蓋過；不變更選取資格或交易。
- RosterTable → 月結調整及各類明細。原生列表表格包含人員、庫存、報表、課程／服務／收費管理、HQ 店舖等，64 個表格入口接入；見 `striped-list-table-inventory.json`。
- 非表格共用列 → 蒸足／課程／美業名單的 roster primitives、月結人員群組、設定列、提醒設定與數位店長紀錄。選單／導覽及卡片不使用全域 li 規則。
- 7 個表格排除：週值班日曆、列印工單、官網方案比較及比較預覽；另外 ops／ranking 三個舊表在已停用頁 redirect 後為不可達程式，不為樣式變更啟用或修改封存頁。沒有放寬其既有 TS／lint 設定。

僅改原生標記及樣式，不新增讀取 API、寫入、資料庫 migration、權限或通知行為。既有字級／padding／高度保留。未取得這輪正式發布明確授權；不重試先前遭自動審核拒絕的 main 合併。

## 驗證

隔離 Vite／Chromium 視覺預覽使用真實 CustomersTable、DataTable、RosterTable、CourseStaffList。30 筆合成顧客，標籤 metadata 與 navigation link 是展示替身；無資料庫、真實帳號或伺服器交易，阻擋外部請求。不能將此結果稱為登入後完整業務驗收。

- 14 組檢查通過：四模組顧客排列、整列與 sticky 欄同色、hover、勾選優先、warning／inactive 保留、搜尋／排序／分頁重排、hidden 列略過、展開不改序、未接入課表不受影響、無外部請求。
- 1366×900、1920×1080、1024×768、768×1024、600×900、390×844、360×800 七種尺寸；整頁無水平溢出，表格區可橫向捲動，固定操作仍可到達。為瀏覽器模擬，非實體 iPad／Safari／LINE。
- 相關 5 檔 68 項測試通過，含設定工作區、月結即時更新、名單共用版面。
- 型別及 changed-file ESLint 另依最終 commit／CI 記錄。legacy 頁既有 warning 不宣稱本輪已修復。

本機重現：`node_modules/.bin/vite --config scripts/qa/striped-lists/vite.config.mts`，另一終端 `node scripts/qa/striped-lists/verify.mjs`。截圖與 JSON 預設寫在 `/tmp/steamfoot-striped-lists`，不加入部署 checkout，避免重演 #1510 middleware 包含 QA 素材的大小限制。

目前為已修改、已完成隔離視覺預覽，尚未發布正式站；遠端 CI／Preview 依最終結果補記。
