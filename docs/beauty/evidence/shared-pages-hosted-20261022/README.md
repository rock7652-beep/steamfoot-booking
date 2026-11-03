# 真實共用頁面驗收證據

- `results.json`：16 個通過步驟及一項 8f00554d 分析數字差異；操作可用不等於數字全對。
- `db-comparison.json`：負向請求前後完全相同，測後餘額／金額／筆數及帳號停用；明列空欄位 null → 空字串正規化。
- `analysis-finding-8f00554d.png`：真實舊版不一致畫面，特意保留，不當作修正版截圖。
- `trend-fix-real-data-replay.json`：只讀 Preview 真實資料於本機重播，5 → 1，非 hosted 修正版通過。
- `trend-fix-regression.txt`：111 項相關回歸。
- 其餘截圖：本版實際應用程式登入後取得；尺寸模擬，不是實體手機／平板。
- 未保存可分享存取 token、cookie、帳密、raw request 或 session state。

- `trend-fix-hosted-results.json`、`trend-fix-hosted-desktop.png`：d7580cce 真實登入後，六個月／一年曲線各為 1、摘要 1、名單與實際技師一致。
- `trend-fix-final-db-check.json`：修正版唯讀驗收後筆數／金額／方案卡未變、QA 帳號仍停用。
