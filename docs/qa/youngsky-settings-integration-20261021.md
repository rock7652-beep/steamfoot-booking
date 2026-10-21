# YoungSky 設定流程：登入與 PostgreSQL 整合量測

日期：2026-10-21（Asia/Taipei）；分支 `fix/youngsky-settings-confirmed-collapse`。

## 已驗證範圍

實際瀏覽器輸入帳密登入 → 現有 Next.js proxy／權限與設定儲存 API → 獨立 PostgreSQL → UI 收合 → Prisma 查詢核對已提交值。未攔截或模擬本輪 API 回覆。

- 專用 Docker 容器 `youngsky-settings-integration`，只綁定 `127.0.0.1:55438`，資料庫 `sports_live_flow_test`。
- 使用現行 Prisma 主／課程 schema DDL，以及現有教練通知 outbox SQL migration。不是正式庫完整 dump；未安裝正式環境全部歷史 trigger。
- 合成店、合成 OWNER、零正式顧客；環境變數以白名單重建，兩個 DB URL 都由現有 `assertSportsLiveFlowQaEnvironment` 精確檢查。沒有載入外部服務憑證，也沒有寄信或 LINE 發送。
- 開發環境 Next.js 16.2.2 Turbopack；不是 Vercel production build、遠端 Supabase pooler 或實際網路延遲。
- 五種設定各三輪，共 15 次真實儲存；另一次真實 PostgreSQL 列鎖競爭。16 次均成功提交及收合。
- 傳統課程設定路徑與正式站共用儲存 API；未繞過原生運動 production allowlist，因此未復刻 YoungSky 正式站原生運動旗標、資料量及所有業務分支。
- 另完成三個設定分類的讀取量測。未驗真實 iPad／Safari。

## 儲存結果

| 設定 | 預熱後 HTTP ms | 後端 handler ms | 權限 ms | 交易 ms | 快取更新 ms |
|---|---:|---:|---:|---:|---:|
| 店家資料 | 384–511 | 222.4–311.6 | 73.2–135.3 | 128.9–157.4 | 0.1–0.2 |
| 預約截止 | 210–506 | 112.9–210.7 | 60.5–101.4 | 41.1–97.4 | 0.1–0.6 |
| 銀行資訊 | 256–338 | 124.9–149 | 67–77.4 | 48.4–60.8 | 0.1–0.9 |
| 候補 | 367–655 | 232.4–249.9 | 49.2–107.2 | 132–175.6 | 0.4–1 |
| 體驗設定 | 361–543 | 158.5–229.5 | 92.5–138.4 | 50.7–76.7 | 0.2–0.2 |

預熱後正常儲存 HTTP 範圍：210–655 ms；後端：112.9–311.6 ms。本輪未重現自然發生的儲存超過三秒。

較早的首次 API 編譯樣本：單次 HTTP 約 2727 ms，handler 220.8 ms；Next 日誌約 2.0 秒在開發編譯。不是正式站冷啟動證據。

每次回覆新增 `X-Settings-Trace` 與 `Server-Timing`，伺服器 `[SETTINGS_SAVE_ROUTE_PERF]` 使用相同 traceId。固定階段標籤，不記錄姓名、帳密、表單內容、SQL 或錯誤原文。

### 真實鎖競爭（控制實驗）

- HTTP：3594 ms。
- handler：3438.2 ms。
- 權限：77.7 ms。
- 等待 Store 列鎖：3279.7 ms。
- 資料寫入：28.5 ms。
- traceId：`c86bc65b-69d1-4ba1-98e2-190e4c88e62c`。

另一條實際 PostgreSQL transaction 刻意持有同店 Store 列鎖，透過真實 UI 儲存重現等待；不是 HTTP sleep。等待時編輯區保持展開、送出停用，釋放鎖後成功提交。這證明計時可定位鎖等待，**不證明 10/19 Zoom 當天發生過鎖競爭**。

`transaction` 包含鎖等待、業務操作、稽核與提交；與內層 `db_lock`、`db_work` 有重疊，不能相加當作總耗時。`authorization` 對 shop 設定含兩次既有權限檢查合計。

## 讀取結果：實際超過三秒的位置

最後一輪首次設定頁：共用 layout 4741.3 ms，設定 hub 2338.9 ms。兩者可並行，不能直接相加。

首次 layout 的主要分段：

| 階段 | ms |
|---|---:|
| 試用狀態 | 998.2 |
| 門市選項／檢視範圍（合計） | 829.5 |
| 登入身分解析 | 722.9 |
| 操作紀錄存取範圍 | 589.5 |
| 目前門市解析 | 544.7 |
| 功能授權呈現 | 411 |

預熱後共用 layout 約 1121–1865 ms，其中功能授權呈現約 411–742 ms。設定 hub 約 210–338 ms。主要改善區域在共用外框的多段查詢及功能授權，而非設定寫入交易。

`read-results.json` 的 documentMs 是真實 navigation requestStart → responseEnd；readyMs 另含 hydration、背景請求與 networkidle 等待，不能解讀為單純後端耗時。三個分類仍各觀察到兩個 courses GET；額外請求的全部來源尚未確定，沒有宣稱已完全消除。

此輪 first-hit 也受開發編譯、HMR、機器負載及多個背景請求影響；三個分類樣本不能作改善前後的統計比較。

## 修正與風險

- 前一輪五種設定成功才收合，失敗／不確定／同步警告保留輸入與提示。
- 設定導引與工作區使用不同 React key，移除整合預覽實際觀察到的重複 key 警告。
- settings 的導引使用 localSections；localSections 放在 setup spread 之後，避免被回傳值覆寫。焦點回到設定頁不再由導引強制 refresh，其他導引頁保留原刷新行為。
- 同一 RSC request 中，以 React cache 依 storeId/userId 共用開店導引讀取；無跨 request／跨使用者個資快取。
- instrumentation 的 Node 專用 import 限制在明確 Node runtime，修正整合預覽的 Edge crypto 編譯錯誤。
- 新增讀取／儲存 trace。layout timer 到回傳 React tree 為止，不代表全部 deferred children／瀏覽器 rendering。
- 新增追蹤及設定導引變更尚未部署、尚未合併正式站。

## 驗證檢查

- 12 個測試檔共 97 項通過，包含設定成功／失敗／不確定／警告、權限與儲存回條、導引焦點刷新、計時 context 隔離。
- 修改的 TypeScript／TSX 及 seed ESLint 通過；git diff --check 通過。
- 全量 TypeScript 檢查通過（tsc --noEmit --pretty false --extendedDiagnostics，退出碼 0，314.10 秒）。未執行含 migration 的 production build。
- 整合伺服器在量測後停止；獨立資料庫保留供重現，不含正式資料。

## 重現

1. 使用獨立本機 PostgreSQL 容器，`127.0.0.1:55438`、DB `sports_live_flow_test`。**seed 遇到既有 Store table 會拒絕覆蓋**。
2. `npm ci --ignore-scripts`，`npm run generate:clients`。
3. `node scripts/qa/youngsky-settings-integration.mjs seed`。
4. `node scripts/qa/youngsky-settings-integration.mjs dev`。
5. `node scripts/qa/youngsky-settings-integration.mjs browser`；讀取專項為 `... reads`。
6. 需 Playwright 與 `/usr/bin/chromium`。測試帳密只適用這個 disposable store，未使用正式帳號。

證據：`results.json`、`read-results.json`、`read-spans.json`、`real-*.png`，以及自包含 `report.html`。

## 重要下一步

先完成包含本次修正、使用隔離資料庫且符合正式架構的預覽驗收；只有該預覽仍重現超過 3 秒時，才依 trace 定位並修正瓶頸。現有隔離測試不能作為正式站耗時結論。

本輪結論只適用本機整合樣本；10/19 台灣時間約 16:00 的實際慢請求仍無逐筆 trace，不能據此斷言其原因。


最新驗收狀態：型別檢查通過、隔離瀏覽器 40／40 通過；本機登入／資料庫整合已有 16 筆儲存驗證。本分支尚無 Vercel 預覽，正式架構的完整業務及耗時驗收仍待完成；未新增效能優化。
