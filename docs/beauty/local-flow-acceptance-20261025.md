# 本機整合流程補驗（2026-10-25）

接續 `a1049c6f`，使用同一隔離支線 `review/beauty-production-integration-20261025`。本輪補驗前次列為尚缺的三段介面流程，直接使用 `BeautyDashboard`、原共用班表、預約清單、顧客／方案工作台、收款小視窗及 `CareWorkspace`。

**本機假資料範圍已通過；真實帳本、權限及資料庫驗收仍未執行。** 本輪沒有啟動應用後端、登入遠端站、連線資料庫、套用 migration、執行正式 build、推送或部署。LINE 持續關閉，正式站及既有資料未操作。

## 通過／尚缺

| 項目 | 實際驗證 | 結果與限制 |
|---|---|---|
| 預約清單 → 顧客 → 購買方案 → 返回 | 設定姓名搜尋、待服務篩選並捲動，開顧客後進購買方案，再返回清單 | 搜尋／服務狀態／捲動位置保留；完整名單 reader 次數未增加。真實後端延遲及權限仍待驗 |
| 預約清單 → 收款 → 返回 | 從捲動後的一列開啟實際小視窗，再取消回清單 | 清單位置保留，沒有重新讀取完整名單；未建立任何真實交易 |
| 剪下／貼上改期 | 從實際預約列剪下，切日表點空白時段；第一次回傳位置衝突，返回重選時段後成功 | 共用確認表單保留剪下對象；衝突時假資料未改，重選後只送原預約 ID；成功後透過實際 calendar reader 接點更新畫面。不是多人資源演算法／並發交易驗收 |
| 顧客經營關懷 | 共用工作台展開 8 位顧客；開啟關懷輸入備註，模擬儲存失敗，重試後到已處理頁籤 | 失敗輸入保留，成功的假回應更新處理狀態與備註；唯讀時無關懷／預約操作 |
| 顧客經營預約接點 | 核對實際預約連結 | 指向美業班表，含 `action=booking` 與對應 customerId；沒有導航到遠端建立預約，因此不宣稱入口到建立完成全流程通過 |
| 音樂／運動共用回歸 | 保留原 9 組瀏覽器檢查；另測班表貼上、音樂查詢提示、運動密度及確認表單 | 通過。音樂的空位查詢提示仍保留；運動使用原用語 |
| 版面 | 新流程桌機 1366、平板 1024×768／768×1024、手機 390 | 40 張具名畫面（含原 25 張操作畫面）無整頁橫向溢出；有檢查失敗與展開狀態。這是 Chromium viewport 模擬，不是真機／Safari／鍵盤驗收 |

預約清單採 28 列合成壓力資料，以製造可捲動的名單；班表同時放置這些資料不代表合法資源配置或可建立 28 人同行預約，僅驗主工作台控制及返回狀態。四人合法預約的欄位檢查沿用前輪案例。

## 發現並修正

1. 美業／運動的剪下貼上不走音樂空位查詢，但共用日表仍一直顯示「正在核對老師與教室…」。現在只在使用該查詢的原流程顯示讀取提示；美業／運動保留既有「選白格貼上」指引。
2. 美業改期衝突提示沿用「空間／教練」。既有提示函式加入服務情境用語，美業顯示「位置／技師」，運動預設文案不變。沒有另做表單、改期規則或交易接點。

驗收工具另修正案例間的網址隔離，避免先前案例留下 customerId 查詢參數讓後一案例自動開啟顧客；正式路由程式沒有為此更動。關懷 textarea 的定位改為控制本身，避免輸入後的 label 文本干擾工具。這些不是正式程式錯誤。

## 畫面

| 對照 | 連結 |
|---|---|
| 剪下讀取提示：修正前／後 | [前](evidence/20261025-local-flow/before-full-cut-1366.png)／[後](evidence/20261025-local-flow/full-cut-1366.png) |
| 清單返回位置 | [開啟前](evidence/20261025-local-flow/full-roster-before-1366.png)／[返回後](evidence/20261025-local-flow/full-roster-after-1366.png) |
| 預約清單中的購買／收款 | [購買方案](evidence/20261025-local-flow/full-purchase-1366.png)／[收款](evidence/20261025-local-flow/full-roster-collection-1366.png) |
| 清單 RWD | [1024](evidence/20261025-local-flow/full-roster-after-1024.png)／[768](evidence/20261025-local-flow/full-roster-after-768.png)／[390](evidence/20261025-local-flow/full-roster-after-390.png) |
| 貼上衝突 | [桌機](evidence/20261025-local-flow/full-paste-conflict-1366.png)／[平板](evidence/20261025-local-flow/full-paste-conflict-768.png)／[手機](evidence/20261025-local-flow/full-paste-conflict-390.png) |
| 關懷失敗保留／完成 | [平板失敗](evidence/20261025-local-flow/full-care-failed-save-768.png)／[手機失敗](evidence/20261025-local-flow/full-care-failed-save-390.png)／[已處理](evidence/20261025-local-flow/full-care-handled-390.png) |

修正前畫面取自基準 `a1049c6f` 的班表原檔，於同一假資料工具重現，沒有覆寫工作樹正式檔案。

## 驗證證據與重跑

- [12 組瀏覽器操作結果](evidence/20261025-local-flow/interaction-results.json)：全部通過、無未攔截請求或頁面錯誤。
- [40 張畫面幾何結果](evidence/20261025-local-flow/results.json)：整頁橫向溢出 0。
- [4 個測試檔、27 項針對性回歸](evidence/20261025-local-flow/tests.txt)：全部通過。新測試證明運動／服務流程沒有假讀取狀態，音樂仍等待實際查詢；服務來源的衝突文案及儲存 port 正確。
- [TypeScript](evidence/20261025-local-flow/ts.txt)、[本輪檔案 ESLint](evidence/20261025-local-flow/lint.txt)、`git diff --check` 通過。

```bash
QA_INTERACTIONS_ONLY=1 \
NODE_OPTIONS="--require=$PWD/scripts/qa/beauty-ui-block-network.cjs" \
PLAYWRIGHT_PATH=/path/to/playwright/package \
node scripts/qa/beauty-integrated-ui-browser.mjs
```

新增假資料 host：`scripts/qa/beauty-full-flow-fixture.tsx`，沒有應用 route 匯入。假 writer 僅回傳記憶體結果；roster／calendar／customer reader 由 window.fetch 攔截，Node sockets、DNS、fetch 及瀏覽器其他請求持續封鎖。輸出可用 `QA_OUTPUT_DIR` 指定；`QA_CHECK` 可限定單一案例。

下一階段仍需核對資料庫環境、備份／還原與正式發布相容性，再取得相應授權才能進行真實交易／部署；本輪不解除既有停止限制。
