# 正式站顧客搜尋量測（2026-11-14）

正式別名 www.steamfoot.com 核對為 dpl_5qJwNP3XuzUfBqJ3Q3qabYzJaNe8，頁尾 2026/11/14 20:25。唯讀測試，未修改正式資料或重新部署。

## 條件與方法

- 桌機 Chrome，既有 System Admin 登入、暖沐蒸足店舖後台，清單 235 位顧客。
- 同一位既有顧客，從顧客管理搜尋框選候選，開啟資料窗。
- 每輪記錄填入關鍵字至候選可見、點選至方案標題可見、點選至摘要載入狀態消失。另確認顧客身分、既有方案金額、下次預約皆正確，摘要無錯誤。
- 計時使用 CUA 執行端 Date.now 包住連續 UI 操作與等待，包含自動化往返及檢查成本，不能視為精確瀏覽器渲染時間或 API 耗時。
- 頁面首次：重新完整導覽至清單，重建頁面記憶體後測試。未清除瀏覽器 HTTP 快取，亦未控制伺服器快取／冷啟動，不能稱完全冷載入。
- 重複：同頁關閉後再次搜尋選取；可能使用既有快取及預讀。單次初探不併入三輪統計。
- 完成條件限目前總覽的基本資料、方案與預約／待收款／健康摘要讀取完成；未逐筆開啟歷史紀錄、方案使用明細或編輯流程。

## 樣本（毫秒）

| 情境／輪次 | 進入清單 | 搜尋候選 | 選定至方案可見 | 選定至摘要完成 |
| --- | ---: | ---: | ---: | ---: |
| 頁面首次 1 | 2802 | 1250 | 1614 | 2589 |
| 頁面首次 2 | 1880 | 645 | 1677 | 2669 |
| 頁面首次 3 | 1825 | 666 | 2483 | 3900 |
| 重複 1 | — | 16 | 82 | 1475 |
| 重複 2 | — | 16 | 60 | 1782 |
| 重複 3 | — | 21 | 80 | 1686 |

首次點選至摘要完成中位數 2669 ms，範圍 2589–3900 ms；重複中位數 1686 ms，範圍 1475–1782 ms。首次搜尋候選中位數 666 ms，範圍 645–1250 ms。清單進入時間獨立列出，未藏入前置等待。

三輪首次均確認顧客、方案與下次預約一致，摘要載入完成且無錯誤；末輪瀏覽器 error logs 為空。本次未重現一分鐘等待；沒有同條件修改前量測，不能量化改善倍數。未驗店長角色或手機／行動網路，也不代表全站四模組效能驗收。

## 原因追查（唯讀）

核對相同正式部署的 12:38–12:39 UTC 測試時段 PERF 記錄：primary 最近 30 筆範圍 346–980 ms、中位數 428 ms；summary 共 8 筆範圍 276–693 ms、中位數 429 ms。primary 含背景預讀，日誌未帶顧客識別，不能逐筆對應選定顧客，也不能將兩組中位數相加當成單次 UI 耗時。兩種計時皆只有 totalMs，spans 空白；queryCount=0 是未記分段，不代表沒有資料庫查詢。時間不包含完整平台排隊、網路、瀏覽器或自動化成本。

已確認的流程：

1. customers-list-with-drawer.tsx 先透過 Server Action 讀基本資料，完成才掛載 CustomerDetailDrawerContent；該內容再掛載 CustomerPanelSummaryView，其 effect 才發 summary-read。此入口沒有傳 initialSummary，因此未命中基本資料快取時存在兩段依序請求。
2. summary-read 明確 no-store，摘要元件重掛即重讀，沒有共用的短期讀取快取。因此基本資料即時顯示時，仍會等摘要。
3. primary 並非僅姓名電話：主查詢包含最近 50 筆預約、所有方案錢包與 sessions／bookings、計數；再依序讀 shopConfig，之後並行讀兩種近期消費。主查詢前另有身分／門市／權限判斷。歷史註解宣稱只取 ACTIVE 並不符合目前查詢，不能依註解判定輕量。
4. 清單背景預讀使用相同 primary Server Action，startDelayMs=0，允許搜尋輸入聚焦時繼續。共用 queue 已有前景優先及保留槽位，開窗也會取消尚未開始的背景工作，但已開始的背景工作不會中止。這是潛在排隊／資源競爭來源，尚未以隔離實驗證實耗時占比。
5. 摘要內的預約、待收與健康查詢已用 Promise.all，不能再稱三者串接查詢；仍要等其中最慢一項才整包回傳，且在權限及顧客範圍檢查之後才執行。

結論：已證實兩段請求依序啟動、每次重開重新查摘要，以及主資料讀取範圍；尚未證實某個 SQL、健康查詢或平台冷啟動是主要瓶頸。先前 2.6–3.9 秒含自動化等待，不能全視為後端耗時。本輪沒有修改程式、正式資料或部署。若後續獲准優化，優先補前景請求排隊／網路與後端分段量測，再決定並行啟動摘要、減少首屏讀取或調整背景預讀，保留授權與交易即時核對。

## 第二輪補查

### 新確認的框架排隊機制

檢視目前安裝的 Next 客戶端實作：`node_modules/next/dist/client/app-call-server.js` 將 Server Action 派送為 ACTION_SERVER_ACTION；`client/components/app-router-instance.js` 的 dispatchAction 在已有 pending action 時，會將非導航 action 加至尾端，待 runRemainingActions 才開始。因此本專案 CustomerReadQueue 的前景保留槽位，無法保證已派送至 Next queue 的 Server Action 立即開始。

清單背景預讀與顧客實際點選都經 getCustomerDrawerDetailAction。故未命中快取時，點選可能等待先前已派送的背景 action；這條排隊路徑由程式可確認，但沒有瀏覽器事件／請求時間線，不可據此宣稱三次樣本各排隊多少毫秒，亦不能稱已確定為最大瓶頸。獨立 GET 的 summary-read 不走該 action queue，但仍須等 primary 掛載面板後才啟動。

### 資料庫讀取與計時缺口

- withExplicitRelationJoins 對未明確指定的關聯查詢強制 relationLoadStrategy=query；primary 未指定 join，會使用分次查詢策略。實際 SQL 次數與各 SQL 耗時未記錄。
- buildDatabaseUrl 的 serverless 預設 connection_limit=1，允許 URL 本身或 DATABASE_CONNECTION_LIMIT 覆寫；本輪未讀取正式憑證或部署環境值，因此不能宣稱正式有效值必為 1。若有效值為 1，Promise.all 也不能保證多個 SQL 同時執行。
- prisma 正式 log 僅 error，沒有 query duration 事件；primary/summary 的 ServerTiming 未記 spans，也未把 timer 傳進 requirePermission。無法從現有 PERF 還原身分／權限／門市／主查詢／設定／近期消費各段耗時。
- instrumentation.ts 未見 OpenTelemetry 註冊。以已存在測試紀錄的 primary request `2twll-1794659952723-0346c55b5fae`、summary request `gp5nx-1794659955025-04db10cf9301` 讀取 Vercel trace，兩筆皆 404 Trace not found。這表示本次取不到追蹤，不能推論所有追蹤皆停用或是留存過期。
- 健康摘要 getLatestNativeHealthRecord 只讀一筆最新原生健康紀錄，未見該流程呼叫 AI 或外部健康服務；仍缺單項耗時，不能排除資料庫等待。

補查結論：確有 Next Server Action 排隊入口與 primary→summary 的依序請求；尚無證據精確切分先前 2.6–3.9 秒中的前端排隊、網路、SQL 與驗收工具成本。下一個有辨識力的實驗是於測試版本補匿名前景／背景請求關聯、各階段計時，並對照獨立 primary GET 或暫停背景預讀；不能靠現有總耗時直接決定提高連線數。此輪仍僅唯讀查核與更新紀錄，未修改應用程式或部署。

## 使用者授權後的本機測試版

依「好 請執行」完成下列修改，尚未 push、建立遠端部署、合併或發布正式站：

- 顧客管理的背景與前景 primary reader 改為獨立、同來源、private/no-store GET；route 呼叫既有 permission-checked action，不接受客戶端指定門市。仍保留既有快取、scope、前景佇列與晚到結果防護。
- 選定顧客時立即啟動 summary promise，與 primary 同時進行；主資料完成後顯示面板，摘要元件接續同一 promise，不重複發送。舊人結果由原有 gate 與每人 props 隔離；重試及 revision 更新仍讀新摘要。
- primary JSON 還原巢狀日期欄位，保留備註文字；兩種獨立 fetch 均有 15 秒逾時保護。未延長金額、堂數或交易快取。
- 增加固定標籤的 OperationTiming：身分／權限、門市上下文、主關聯查詢、預約設定、近期消費，以及摘要的範圍、功能資格、下次預約、待收、健康讀取。primary GET 另回傳整體 Server-Timing。計時不含顧客識別或內容，不調整連線數、SQL 策略、通知或交易規則。

驗證：

- 14 份相關 Vitest 檔案，91 項通過；含新 route 的參數與拒絕結果、忽略不可信 storeId、巢狀日期還原、搜尋候選在 primary 未完成前啟動 summary、共用進行中摘要、摘要重試／修改後重讀，以及原有換人、關窗、快取、方案、紀錄與預約檢查。
- TypeScript noEmit 通過（預設 4 GB 程序 OOM 後，以檢查程序 8 GB heap 重跑成功）；應用程式記憶體設定未改。
- 修改的應用程式檔 ESLint 與 git diff --check 通過；依 React best-practices 檢視並行請求、hook 依賴及作用域隔離。
- 本機 127.0.0.1:5202 合成預覽：實際 Drawer 控制器、獨立 HTTP readers、RightSheet、摘要元件；清單、cache provider 與方案內容為隔離簡化版，無正式資料庫／帳號／通知。桌機實際 CSS viewport 1710、iPad 模擬 1024、窄容器 375 px 均無頁面水平溢位；甲關閉後開乙，乙摘要正確且無甲摘要殘留。臨時 viewport 已 reset。
- 上述合成預覽不能替代登入後實際業務驗收、完整方案版面 RWD 或正式效能比較。未跑具有 migration／外部 readiness 副作用的 production build；未量到新版的正式站秒數，不宣稱已降低至特定時間。

後續必要驗收：在具既有登入、確認資料／通知隔離的 Preview，以相同門市、顧客、帳號與條件重做三輪首次及再次操作，核對分段紀錄、資料與耗時，再評估正式發布。
