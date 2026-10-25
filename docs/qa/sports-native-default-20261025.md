# 運動模組預設原生新版及排課模式同步

## 最終行為

正式運動模組依實際 Store 的 COURSE 類型及 ENABLED business.fitness entitlement 啟用新版，排除 ENABLED business.music。既有及新建立的店家不再依賴 SPORTS_REDESIGN_PRODUCTION 或 SPORTS_REDESIGN_STORE_IDS。舊環境變數保留供發布回復參考，但新程式忽略其 rollout 值。沒有開通業務模組的課程店家顯示開通提示，資料庫查詢失敗直接回報錯誤，不回落到舊表單。原正式 repository/main/資料庫來源檢查、實際角色與 schema readiness、操作權限及永久課新增暫停均保留。

模組資格由伺服器依 storeId 查詢；所有既有使用點等待結果，涵蓋後台、會員預約、收費、出席／扣還點、補課、租借及人員。使用 React.cache 僅去重同一請求，不保留跨請求店家資格名單。沒有 schema、migration、GRANT、角色或帳務資料變更。

銀百合實際設定 selfBookingEnabled=false、assignedSchedulingEnabled=true 已唯讀確認。課表 JSON 讀取現在回傳目前排課模式；開啟排課時再讀取，避免沿用舊頁面的設定。若已選模式被關閉，表單改用仍開啟的模式，隱藏人數上限及候補，保留時間／學員等草稿。兩種模式都關閉時不允許送出；後端仍依當下規則檢查。

## 驗證與限制

- 原生新版範圍回歸：28 檔／273 項通過，包含店家隔離、開放選課／指定學員、出席／取消／補課、計酬、排課 API 及正式資料庫 readiness。
- PGlite 實際 SQL：2 項通過，確認音樂優先、其他模組不誤入、停用模組拒絕，以及部署後新建立店家在開通後立即使用新版。
- 排課模式及 JSON 讀取：5 檔／32 項通過。合併空間修正後的 3 檔／13 項回歸通過。
- TypeScript noEmit、變更檔 ESLint（零 error，既有 unused 警告）及 git diff --check 通過。
- 修改前 main@620bdb14 對完整測試初次失敗檔案的基準重現：47 檔中 42 檔失敗／54 項失敗，主要含已移除 SPA 的契約、舊 UI 與 preview mock。不得將完整測試寫成全綠。本次新增的 async 與模組資格相關失敗已逐一修正並以獨立範圍測試回歸；沒有改動其他模組的既有失敗來湊全綠。
- 以實際 SportsScheduleFields、交易 action 全拒絕的合成 Chromium 預覽，於 1440×900、1366×900、1024×768、768×1024 確認關閉開放選課後選項／容量／候補消失、時間保留、無整頁水平溢出。證據見 artifacts/sports-native-default-20261025。這不是正式登入交易、實體 iPad／Safari 或跨裝置完整驗收。
- React 檢查：新增資格查詢只在伺服器，表單模式依 props 推導，不以 effect 清除輸入；開啟排課讀取沿用現有 panel reader，其他資料來源不新增請求，無字級或操作尺寸縮減。
