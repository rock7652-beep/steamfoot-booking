# 共用頁面本機證據

本目錄為合成驗收，使用真實共用元件與 CSS，沒有登入、資料庫、通知或交易寫入，不當作 hosted／實體裝置／店家簽收。

- `browser-results.json`：48 個三模組／多尺寸、設定草稿及美業顧客連結案例。
- `unit-tests.txt`：11 檔／108 項通過，包含原運動／音樂設定與分析回歸。
- 截圖為 Chromium 模擬尺寸；未使用真實顧客資料。
- 重跑：`PLAYWRIGHT_PATH=<已安裝的 playwright 路徑> node scripts/qa/beauty-shared-pages-browser.mjs`。fixture 攔截網路，後端 action 一律禁止。
- 逐項範圍及缺項見 `../../shared-growth-analysis-settings-20261022.md`。

`original-settings-states.json`：原運動／音樂設定的 36 個功能三態與撤權案例；合成狀態回歸，不另宣稱真實裝置或 hosted 儲存。
