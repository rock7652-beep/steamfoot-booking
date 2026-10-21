# YoungSky 設定流程隔離驗證（2026-10-21）

目標：確認成功後收合，並保留失敗、結果不確定、同步警告的編輯內容及提示；驗證 3.3 秒慢回覆。

## 結果與範圍

- 修正前：五種設定收到模擬成功回覆後，編輯區全部未收合。
- 修正後：40 個 Chromium 案例通過。1366×900 的五種設定各驗五種情境；1920×1080、1024×768、768×1024 各驗五種成功情境。
- 成功：更新摘要並收合，不重新整理整頁。失敗／結果不確定：保留草稿，明確顯示提示，允許核對重試。同步警告：已提交資料保留，編輯區及警告保留。
- 結果不確定的重試保留原 requestKey；等待期間送出按鈕停用。尺寸改變後輸入保留、無整頁水平溢出。
- 12 個相關測試檔共 97 項通過；修改檔案 ESLint 通過、git diff --check 通過。最後一輪瀏覽器驗收 40／40 通過，原始結果已更新。
- 全量 TypeScript 檢查通過（tsc --noEmit --pretty false --extendedDiagnostics，退出碼 0，314.10 秒）。未執行 production build（build script 含 migration），未部署、未合併正式站。

## 慢回覆（合成資料，人為注入 3300 ms）

| 設定 | 觀察到等待 ms | HTTP 等待 ms | JSON 解析 ms | 回覆到收合 ms |
|---|---:|---:|---:|---:|
| 店家資料 | 51 | 3402 | 3 | 25 |
| 預約與取消截止 | 220 | 3698 | 22 | 145 |
| 銀行轉帳資訊 | 55 | 3318 | 3 | 25 |
| 候補 | 78 | 4152 | 4 | 44 |
| 體驗設定 | 89 | 3363 | 1 | 48 |

回覆到收合以 MutationObserver 記錄 hidden 屬性變更。等待狀態為測試觀察值，受驅動程式開銷影響，不作效能 SLA。失敗及結果不確定情境的結果表為「重試成功後」的最終狀態，重試前另有保留輸入、錯誤可見及重複送出防護檢查。

## 證據與重現

- `artifacts/youngsky-settings-20261021/preview.html`：自包含圖文預覽，可下載打開。
- `artifacts/youngsky-settings-20261021/results.json`：40 案例原始數據。
- `artifacts/youngsky-settings-20261021/baseline.json`：修正前比較（不採計初版腳本等待文字造成的 observed 延遲）。
- 修正後：`node scripts/qa/youngsky-settings-browser.mjs`。
- 修正前：在 HEAD 仍為修正前基準時，`QA_BASELINE=1 QA_OUTPUT=/tmp/youngsky-settings-before node scripts/qa/youngsky-settings-browser.mjs`；此模式使用 git HEAD 元件。
- 需 npm ci --ignore-scripts、Playwright 與 `/usr/bin/chromium`。測試只攔截 synthetic.invalid 的合成回覆；server action 一律阻擋，未使用任何帳號或資料庫。

## 限制及重要下一步

本輪只有瀏覽器與模擬 HTTP 邊界，未驗證真實 API、權限、資料庫、快取、Safari、真實 iPad 或正式店長帳號。不能推論 10/19 台灣時間約 16:00 Zoom 操作實際耗時，也不宣稱正式站已低於三秒。

先完成包含本次修正、使用隔離資料庫且符合正式架構的預覽驗收；只有該預覽仍重現超過 3 秒時，才依 trace 定位並修正瓶頸。現有隔離測試不能作為正式站耗時結論。


最新驗收狀態：型別檢查通過、隔離瀏覽器 40／40 通過；本機登入／資料庫整合已有 16 筆儲存驗證。本分支尚無 Vercel 預覽，正式架構的完整業務及耗時驗收仍待完成；未新增效能優化。
