# 運動正式入口回歸修正

基準 main `1a744cc6`。僅修正入口與唯讀授權傳遞，不部署、不啟用、不執行 migration，未更動音樂測試站或正式資料。

## 問題及修正

正式 production gate 開啟時，`/dashboard/courses` 原先提前回傳早期 `SportsStagingWorkspace`，遮蔽後續已驗收的 `CourseWorkspace`；教學項目入口也被此攔截。移除此 early return，使用既有 `sportsNative` gate、原課表、既有教學項目清單及 metadata-only `loadSportsStaging(true)`。收費方式維持原有 plans 分流，沒有重做介面或交易核心。

啟用與店家白名單、business.fitness、角色及 feature 權限仍沿用既有守衛。將 view-only context 提前讀取，原課表、教學項目、租借及現金捷徑共用 writableStore；即使帳號與店家相同，只要是唯讀模式，也不載入寫入表單、不自動展課、不提供新增／編輯／刪除／收款。跨店讀取仍限定選定店家，server action 授權未改。

## 驗收證據

- 修正前同一組新測試有6項失敗：兩店原課表、Admin入口、兩店教學項目及同店ID的明確唯讀模式。修正後12項入口測試全部通過。
- 12檔123項回歸通過，涵蓋正式白名單與環境、資料庫readiness拒絕、子店唯讀、永久課撞課、出席更正、請假／曠課釋放、取消及既有課表操作。
- 另4項審查分支拒絕部署／migration tripwire通過，合計127項。TypeScript noEmit、變更來源ESLint與git diff檢查通過。
- 本機真實Chromium載入現有CourseWorkspace與樣式，使用合成資料及框架／資料傳輸替身，所有交易actions拒絕執行，不連資料庫。
- 9組UI情境：新莊店可操作、板橋店可操作、板橋子店唯讀，各1440x900、1024x1366（模擬觸控）、1366x1024。月／週／日切換、五種排課類型、指定學員／開放選課及唯讀禁止排課均通過，無pageerror或全頁橫向溢出。

證據位於 `artifacts/sports-native-entry-20261019/`，含日誌、9張截圖、browser-results.json及本機預覽harness。可執行 `node artifacts/sports-native-entry-20261019/preview-server.mjs`，再以Playwright腳本檢查；只啟動127.0.0.1:5189。需專案依賴及Chromium，Python腳本使用環境提供的`/usr/bin/chromium`。

## 邊界

Server page路由驗收使用mock登入、權限與資料讀取；瀏覽器使用實際客戶端元件加合成props，兩層分開驗證。這不是正式登入、完整Next伺服器或真實扣還點端對端驗收，平板是viewport／touch模擬，未宣稱實體iPad/Safari通過。原交易核心與正式資料均未修改。

正式兩店旗標仍關閉。main與本審查分支Git自動部署保持false；審查分支另於ci-migrate最前段拒絕，避免託管平台自動建置接觸資料庫。此PR僅待審查，沒有合併或部署。
