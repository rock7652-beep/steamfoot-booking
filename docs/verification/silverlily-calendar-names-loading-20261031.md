# 課表教學項目、重整與三模組開窗驗收（2026-10-31）

狀態：Draft PR #1478，未合併或正式發布。正式基準 `b1f1a7c9050edf685a1f2e2c367a0a57e5772e36`；最新驗收應用版本 `a288e936abd3766a3c9cb45a5476304a14cad232`。第一輪摘要的 1.9 秒完整讀取未獲使用者接受；以下最新量測才是本次完整名單改善的依據。

## 完整名單第二輪驗收

只衡量完整名單搜尋欄與操作內容載入，摘要首次顯示不算完成。使用逐幀 DOM 檢測並記錄 Resource Timing／Server-Timing；舊 locator 輪詢數字不直接作百分比對照。相同 Chromium／環境代理、相同 QA 課堂、正常 OWNER 登入，順序比較 `884089c` 與 `a288e93`；不是台灣使用者端 RUM，也不是 p95。

| 場景 | 舊完整名單中位數 ms | 新完整名單中位數 ms | 新非 warmup 範圍 ms | 舊→新伺服器中位數 ms |
| --- | ---: | ---: | ---: | ---: |
| 運動單人名單 | 1542.5 | 1107 | 830–1141 | 813.5→324 |
| 運動正式課，同堂體驗＋持卡學員 | 1777 | 1163 | 880–1298 | 963→354 |
| 音樂 | 1738.5 | 1030 | 819–1067 | 992→347 |
| 美業 | 1069.5 | 841 | 684–973 | 397.6→167.1 |

舊單人／音樂／美業各 4 次非 warmup，混合名單 5 次；新版各 5 次。新版 cold sample 分別 1089／1022／1078／1509 ms，不能宣稱每次或首次都低於一秒。完整傳輸與顯示仍包含代理、路由和跨區等待，未把它們全部歸因於資料庫。45 次讀取、8 組正常登入與 live roster 檢查完成、pageerror 0；四個場景前後完整 `data` 的 SHA-256 各自完全一致，沒有靠刪減權益、收費或候補欄位換取速度。

實作：音樂／運動 HTTP read 明確建立單次請求 scope，共用當次已驗證身分解析；各權限 grant、門市、會員資格、模組檢查仍保留。名單、候補、政策、期別與餘額的獨立讀取並行。共用門市 plan/module 查詢只在 opt-in read request 內合併；不同店、不同請求及傳入的 transaction client 不共用。沒有跨請求快取身份、金額或額度。課程 client 改用既有 `buildDatabaseUrl`，和其他 client 一樣補齊 Supabase pooler 相容參數，保留 URL 原設定與 serverless 一條連線上限；沒有提高資料庫連線上限或修改 schema。

最新 Preview：`dpl_HFz5m9a7hMfFE46zAwTRkXjWJ7TM` READY／hnd1，來源 `a288e936abd3766a3c9cb45a5476304a14cad232`。中間候選 `c9963e1`／`dpl_FHtCVTH9BNYawdYWidpzneKnTu88` 完成三模組比較；`c475792`／`dpl_CUtwSbvGX5aokkcaiEofdu1FqspP` 僅建置，未另宣稱瀏覽器驗收。23 小時存取連結持續最多兩個測試部署：已撤銷最初 `80d9022` 與中間 `c9963e1` 的連結，目前是 `884089c` 比較基準與 `a288e93` 候選。應用登入未略過。

最新應用 CI [41213388349](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41213388349)：Typecheck、Changed-file ESLint、Targeted tests、Full Vitest 全部成功。全量 1567 檔／14949 項通過，30 檔／257 項 skip；運動共用卡與音樂補課隔離 PostgreSQL workflows 成功。局部相關回歸另 12 檔／119 項通過。新增同請求身分合併、跨請求重驗、不同門市隔離、transaction reader 不合併、拒絕結果不跨請求、餘額讀取不等待請假歷史等測試。

驗收沒有點名、收款、扣堂或送出表單。切換到 12 月混合課時，既有 `ensureSportsMonth` 自動展開四堂固定課的八筆 `UNPAID` 合成預約，因此 CourseBooking 是 613→621；這是既有課表的自動延展副作用，不能宣稱完全沒有預約寫入。只有隔離測試店受影響，不刪除或倒回它們；正式資料未寫入。CoursePurchase 125、CoursePointEntry 933、BeautyPayment 90、BeautyLedger 126 計數保持相同；這些計數不取代逐列帳務驗收。三個測試帳號再次停用、密碼雜湊清除、Staff INACTIVE；臨時明文憑證檔清除。

[逐次量測與完整資料一致性](silverlily-calendar-loading-20261031/critical-path-results.json)；驗收器 `scripts/qa/service-calendar-critical-path-browser.mjs` 使用 chmod-600 臨時輸入檔、只輸出耗時與 payload hash，無 route mock。此輪只有後端／連線參數／診斷調整，沿用下方既有三尺寸 UI 邊界與草稿驗收，不冒稱再次跑過實體裝置。正式站未更新，仍需使用者接受速度及明確正式發布授權。

## 使用者規則及課名問題

同一堂 A 課程可包含體驗、10 堂、20 堂及其他方案的學員。銀百合課表一律顯示教學項目 A，體驗、購買與扣抵屬於個別學員。後續要求音樂、運動、美業同步檢查開窗與名單載入。

正式資料僅唯讀：截圖 2026 年 11 月 10 堂／13 人次均存為體驗；7 堂保存的名稱含方案堂數，這 7 堂建立於台灣時間 10 月 30 日晚間。前次核心修正只對一般課避開方案名稱，指定學員體驗課仍會找同模板方案命名；初次課表與背景讀取也沿用舊快照。現在新運動排課、既有課表初次載入、背景 JSON 都依實際教學項目關聯顯示；無法追溯的歷史資料保留原名，不靠字串猜測分類。本次不重寫歷史快照、課堂分類、預約、購買或扣抵。

## 第一輪共用載入改進（歷史證據）

- 設定引導不再對音樂／運動課表的 focus 或日期變更重複 router.refresh。課表自己的同步保留，讀取提示固定高度。
- 原生運動表單先用已授權課表的教學項目、老師與教室顯示，獨立讀最新選項；尚未確認選項時禁用提交及新增租借顧客，回應後保留已輸入時段。選項不再讀整店方案／已購卡片，只有非財務選項在 keyed scope 預讀 15 秒。價格、名額、餘額與交易維持後端權威查核。
- 音樂與美業原已帶入的表單 props 直接顯示，不額外新增等待。三模組共用名單先顯示課表中已授權的姓名摘要；查核期間不提供點名、收款、餘額或方案操作，成功後切換原完整名單。
- 音樂／運動名單的獨立查詢並行，空名單／無卡名單省略無關購課與卡片歷史。美業權限／功能檢查及獨立財務查詢並行。沒有用摘要替代財務查詢。
- 維護 `docs/panel-loading-inventory.md`，不改期課、補課、同行、退款或扣抵規則。

## 隔離部署與權限

同專案 `steamfoot-booking`、hnd1 runtime，兩階段部署：

| 用途 | 應用版本 | Deployment |
| --- | --- | --- |
| 基準（僅加入隔離分支守門） | `80d90224739492694ae7c188b7fe2178b0aca3b1` | `dpl_4YsKBSDWhn7fm3pVPvdFH5d9WQMW` |
| 第一輪選項／查詢優化 | `84adf3a2153654e8cbe2c1b5ab880122bdc6aee1` | `dpl_HsqR9Mx4D2TXDkCEjXYfj2r9vjpz` |
| 第一輪即時表單／三模組名單摘要 | `884089c34be399ebf57c85dee6f3a9f5bcc8ab52` | `dpl_3hLMX1h4g2RcZfLWuT1YPMbPbYYN` |

全部為 Preview、READY；分支自動部署停用，人工部署保留 exact branch／repo、兩條既有隔離 DB 連線與通知停發守門。僅使用 `sports-live-flow-store`、`store-lubymusic`、`beauty-hosted-20261021` 的既有合成資料。音樂 capability 僅擴及本分支的同一隔離店，不授權匯入或正式發布。美業分支設定只針對既有 QA 店，legacy 隔離資料庫，通知明示關閉。

使用者明確允許兩個隔離 Preview 的 23 小時存取連結。替換修正版前已撤銷第一輪修正版連結，保留一個基準及一個最終候選。Vercel 保護仍啟用，應用使用新建的三個 example.invalid 臨時 OWNER 正常帳密登入，未繞過應用權限。沒有修改持久瀏覽器信任庫；驗收程序僅在獨立臨時 Chromium process 釘選既有環境代理憑證，未全域略過 TLS 錯誤。

## 真實瀏覽器結果

Playwright／Chromium，正常 HTTP cache、無 route mock 或認證 mock；同一隔離課表，正式財務提交零次。第一輪 1 次 warmup＋4 次：排課資料就緒中位數 2359.5 → 1348 ms；完整名單 1848.5 → 1858 ms，沒有證明名單完整讀取加速。因此再補即時摘要，不能只以第一輪查詢省略宣稱全面加速。

最終候選的開窗後首次可見與權威資料就緒，毫秒：

| 模組 | 表單首次顯示 | 名單姓名摘要首次顯示 | 完整名單就緒 |
| --- | --- | --- | --- |
| 運動（4 次非 warmup 中位數） | 53 | 65 | 1856 |
| 音樂（1 次非 warmup） | 261 | 57 | 2354 |
| 美業（1 次非 warmup） | 55 | 114 | 1415 |

運動最新選項就緒仍約 840–1853 ms。首次顯示不是權威財務資料已讀完；音樂／美業樣本少，不作 p95 或正式銀百合速度保證。名單針對 2026-11-27 同一筆有學員的 QA 課堂／預約；未用空堂課冒充有名單的即時顯示。

21 項 hosted 檢查完成、pageerror 0：三模組正常登入；1366×900、1024×768、768×1024 的表單／名單邊界與縮放後時段草稿保留。第一輪另確認切回視窗不觸發運動課表整頁 RSC 重整。尺寸為雲端 Chromium viewport，不是實體 iPad／Safari。

機器結果：[第一輪配對](silverlily-calendar-loading-20261031/initial-comparison.json)、[最終三模組](silverlily-calendar-loading-20261031/three-module-results.json)。原始截圖僅留 `/workspace/reports/silverlily-calendar-loading-20261031/final/`，含既有 QA 姓名，不提交圖片至 repo。此處沒有真人 LINE、真實門市收款、點名／扣堂或新排課寫入驗收。

## 測試、對帳與限制

最終相關回歸 28 檔／300 項通過；隔離守門另 3 檔／75 項通過；美業名單簡化 fixture 的回歸通過。CI 曾因該 fixture 缺少 items 失敗，已補足 fixture；其 TypeScript 斷言再改為明確的窄 fixture 斷言，不更動應用程式。最終 CI 狀態另於收尾更新，不把中間失敗標成全綠。

隔離驗收前後的計數一致：CoursePurchase 125、CoursePointEntry 933、CourseBooking 613、BeautyPayment 90、BeautyLedger 126。這是計數與未送出業務操作的核對，不冒稱逐列內容 hash 或完整帳務驗收。三個臨時 User 已 SUSPENDED、passwordHash NULL；三個 Staff 已 INACTIVE。臨時密碼／存取設定檔清除，原交易、登入稽核及合成資料保留。

Cloudflare Workers Builds 仍 failure，不能說全部外部檢查成功。依 [既有發布路徑調查](plan-session-adjustment-cloudflare-20261031.md)，本次再查 `www.steamfoot.com` 仍是 Vercel 專案已驗證正式網域，main protected=false、required checks 空。未改任何分支規則或 Cloudflare 設定；遠端 Worker 詳細錯誤日誌仍未取得，不猜其第一個失敗原因。它不作這次 Vercel Preview 驗收的通用阻擋，也不代表已修好該平台。

下一步：由使用者驗收最新候選的完整名單速度；明確授權正式發布前保持 Draft。
