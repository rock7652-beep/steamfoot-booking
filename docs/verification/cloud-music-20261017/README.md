# 雲端音樂教室驗收紀錄

日期：2026-10-17，Asia/Taipei。於雲端 `/workspace/steamfoot-booking` 執行，非原本本機環境。

基準提交：`c71b3ec384a0121dbe4bf2f64469b79611b43810`。
工作分支：`feat/cloud-isolated-music-dev-20261017`，承接 `feat/music-opening-state-20261007`；原快照與基準分支均保留。

## 本輪結果

| 檢查 | 結果與證據 |
|---|---|
| 隔離啟動 | Node 24.19.0、Next.js 16.2.2；全新 Docker PostgreSQL 16 Alpine，標記／實際目的地核對成功，`dev:isolated start` ready |
| Prisma | npm ci 及主系統／SPA／Course clients 6.19.2 生成成功；Prisma engine 實際下載端點 HTTP 200 |
| HTTP／登入 | 登入頁 HTTP 200；錯誤密碼拒絕並留失敗稽核；真實 Credentials 登入後進店別後台；課表及 Server Actions HTTP 200 |
| 每週固定課 | 2026-11-02／09／16／23；預覽與 PostgreSQL 一致：CARD×3、UNPAID×1；排課後餘額仍 3 |
| 隔週跨期限 | 2026-11-02／16／30／12-14；課卡期限 11-10：CARD×1、UNPAID×3；排課後餘額仍 4 |
| 無課卡／待繳費 | 每週四堂均 UNPAID、pointCost=0、cardId=null，不扣其他課卡 |
| 連按新增 | 三種情境皆在同一事件內 click 兩次；每組仍只有 1 系列、4 堂、4 預約，初始四堂不重複建立 |
| 連按／同時點名 | UI 連按，另以兩個並發 HTTP 請求重送相同 Server Action payload；每組兩個回應皆 HTTP 200。付費 CARD 僅扣一次，餘額 3→2、DEBIT=1；過期課卡之外的 UNPAID 及無課卡 UNPAID 均出席成功、DEBIT=0、其他卡不扣 |
| 桌機／iPad | 1440×1000、820×1180、1180×820；在三種尺寸完成實際新增流程，並檢查三種點名結果於所有尺寸。文件寬等於視窗寬，對話框均在可視範圍；名單表格維持區塊內捲動；已人工看圖 |
| 瀏覽器錯誤 | 最終重跑 HTTP ≥400 為 0、console error 為 0、pageerror 為 0；`browser-errors.json` 為空陣列 |
| 資料庫彙總 | series=3、sessions=12、bookings=12、attended=3、unpaid=8、DEBIT=1、負餘額=0、重複預約=0；18 筆歸屬合成管理者的 AuditLog，驗證既有交易／稽核包裝保留 |
| 安全拒絕 | 實際 PostgreSQL 錯誤 guard token／位址拒絕；應用角色不能更新 guard marker；遠端、模糊主機、URL override、production／test／provider 身分拒絕；業務 query／transaction 不在核對失敗後執行 |
| 發布保護 | production 與既有 Preview 相關回歸通過；開發模式 build／start／export 的 Next phase 拒絕；實際 `npm run build` 在第一步拒絕，沒有進入 ci-migrate |
| 自動化測試 | 15 個測試檔、352／352 通過（`tests.txt`），包含原指定六組54項、發布／Preview／開發隔離／通知／audit transaction／Next config；TypeScript `tsc --noEmit --incremental false` exit 0；變更 TS 檔 ESLint exit 0；更新後 lockfile 的最終 npm ci 及三組 clients 重新生成成功（721 packages） |
| 清理 | 已停止本輪 Next 開發程序；`dev:isolated clean` 成功刪除本輪標記容器與匿名 volume，標記容器查詢為空；manifest 與合成登入 JSON 已刪除；保留無憑證結果與截圖 |

完整啟動、驗證、清理操作見 `docs/cloud-isolated-development.md`。可重跑的瀏覽器腳本：`scripts/isolated-dev-browser-check.mjs`。

## 限制／未驗

- 本輪是新空白資料庫的合成流程驗收，未連線、修改或重新驗證正式／既有遠端營業資料。未合併、部署正式站或重新部署既有 Preview。本工作分支已在 Vercel deploymentEnabled 設為 false，保存分支不自動部署。
- 實體 iPad／Safari、長時間自動展課、排程跨日、更多使用者的高併發壓力、全站所有模組／歷史 migration／RLS 並未驗收。兩個同時點名請求不等於高併發壓力測試。
- 不將本輪的開發 schema bootstrap 宣稱為 production schema 的完整複製；僅核對本輪指定流程所需依賴、CHECK、唯一索引及 compensation／通知 trigger。
- 使用既有密碼登入驗證，未對外呼叫 LINE／Google OAuth 或發送通知；外部整合繼續被封鎖。
- 沒有執行可成功產出部署的完整 build；此模式刻意拒絕該入口。雲端開發不需改動既有發布配置。
- 並發 HTTP harness 最初共用 Next.js debug request ID 會觸發 devtools 串流 close 警告，已依本版 transport 機制將兩個請求 ID 分開；最終重跑無該錯誤，未修改 Next.js、業務 request key 或保護條件。

## 保存的無機密證據

- `flow-results.json`：逐堂預覽、日期、類型、排課前後額度與系列數（全合成）。
- `attendance-results.json`：兩個同時 HTTP 點名回應、出席與扣堂前後結果。
- `database-summary.json`：最終 aggregate 核對。
- `desktop.png`、`ipad-portrait.png`、`ipad-landscape.png`：真實登入／資料庫流程後的畫面，內容均為合成資料。
- 未保存登入狀態、cookie、密碼、連線 URL、.env、容器 inspect 完整內容或真實學生資料。
