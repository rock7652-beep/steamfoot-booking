# 課表跨月逐段計時

目的：拆開正式版 `f64aabb7` 的固定課同步與月份讀取。先前正式日誌出現 1.775／2.938／2.985 秒的同步＋讀取請求；其中「月份讀取扣除名單後」尚有 537／1295／905ms 無法歸因。最初提交僅增加觀測；後續依「未穩定低於兩秒不上線」要求加入唯讀範圍重用與查詢優化，最新結果見下方。

## 新日誌

`[COURSE_CALENDAR_PHASE_PERF]`，operation 為 `sports_sync`、`month_fitness` 或 `month_music`。同一 HTTP 請求的同步與讀取紀錄由 Vercel 原生 request ID 對齊；保留既有總計日誌、Server-Timing 與名單細項日誌。

每筆包含 `totalMs`、`ok`、`spans`、`counts`、`dropped`。每段包含固定 `name`、相對操作起點的 `startMs`、`durationMs`、`ok`。最多 96 段，超過時只累計 dropped，不停止業務工作。只記有限詞彙與非負整數筆數，不記門市／顧客 ID、電話、日期、查詢參數、SQL、結果內容、錯誤訊息或憑證。

- operation 的 ok 同時辨認拋錯與已處理的 success=false。
- span 的 ok 代表該工作沒有拋錯，不等於獲得權限。例如資格查詢正常回傳 false，資格查詢 span 可為 true，但外層操作仍失敗。
- 若 Promise.all 提前拒絕，仍在執行的平行子段標記 ok=null、durationMs=null，不誤報為失敗或耗時 0。
- 起始時間可判別巢狀與平行工作；duration 不能直接相加。
- 計時包含 import、連線等待、網路及應用程式處理，不代表 PostgreSQL 純執行時間。
- 日誌寫入失敗不替換原回傳值或例外。未進入 trace 的呼叫不輸出這組日誌。

## 同步分段

| 名稱 | 工作 |
|---|---|
| access／access.permission.*／access.store.* | 原 booking.create 身分、權限、店家、模組與工作人員檢查；沿用既有 music checkout 計時 |
| sports_scope／module_entitlement | 運動資格與模組資格 |
| production_readiness | 既有正式資料庫就緒交易，包含其連線／等待 |
| month_scope | 整個 ensureSportsMonth，為以下階段的父段 |
| subscription | 訂閱可寫狀態 |
| release_candidates／release_transaction | 既有 NO_SHOW 可釋放課次查詢；只有有候選時才進原交易 |
| series／series_scope／series_readiness／series_rows | 系列資格、就緒查核與系列資料 |
| missing_occurrences／missing_plan／missing_batch | 預期課次計算、每 250 系列的既有存在性查詢 |
| materialize | 只有真的缺課次時執行原展課交易 |

counts 包含 series、release_candidates、missing_batches。父段涵蓋子段，不可重複相加。沒有該段代表原分支未執行，不應補成查詢耗時 0。

## 月份讀取分段

| 名稱 | 工作 |
|---|---|
| access／access.permission.*／access.store.* | 原 booking.read 檢查，使用原 courseManagerRead timing callback；不重用或跳過驗證 |
| sports_scope／module_entitlement／booking_feature | 運動資格、實際模組與 BASIC_BOOKING |
| month_batch | 等候全部月份基本資料的父段 |
| sessions／rentals／rules／hours／special_days／availability_exceptions／scheduling_modes | 七組既有基本資料查詢的獨立時間；保留 Promise.all |
| customers／rosters／labels／recurrence | 既有顧客、完整名單、音樂標籤及週期判斷 |
| month_details | 等候四組 details promise 的 join 時間；子工作在 join 前已啟動 |
| presentation／calendar_days／response_projection | 課程顯示投影、營業日計算及回傳資料組裝，不包含 route 的 JSON 序列化或傳輸 |

counts 包含 sessions、rentals、customers。名單原有的授權與 17 類共用讀取仍看 `[calendar-roster-preload]`，已補正 `sports-rules-booking-read-ready` 的固定名稱，不再歸成 other。

## 判讀方式

1. 固定來源 SHA、請求 ID、入口與 operation；避免拿 calendar-read 的入口總計，當成 calendar-sync 同步後的 readMs。
2. 先看總計與跨度：同步偏慢追 access、production_readiness、month_scope；讀取偏慢追 access、month_batch、rosters 與組裝段。
3. 父段慢但子段短，才檢查尚未覆蓋的間隙、動態載入、交易等待與程式處理；單條資料庫慢仍須另有 SQL／連線池證據。
4. 比較相同月份、資料量、權限與環境，保留完整課表／名單正確性。不能因增加計時就宣稱改善或保證低於兩秒。

## 驗證與交付邊界

- 合成測試涵蓋併發 trace 隔離、有限標籤／筆數、96 段上限、錯誤保留、logger 失敗及不記資料值。
- 實際月份 reader 的 mocked ports 驗證階段接線、資料投影一致，以及拒絕授權後不查課表；其他授權、母子店、同步順序、課程及名單回歸一起執行。
- 本分支關閉 Vercel Git 自動建置，使用手動釘選 SHA 的隔離 Preview；尚未合併／發布正式站，未改 schema、資料庫全域設定、Secrets 或通知。

本地最終驗證：10 個相關測試檔、112 項通過；完整 TypeScript、變更檔 ESLint 及 diff whitespace 檢查通過。所有業務測試均為 mocked ports／合成資料，不替代新版本的正式 runtime 數據。

## 兩秒門檻與優化進度（尚未通過）

門檻為點擊切換至完整月份課表與所有名單可用，不採單一 API、平均值或先顯示部分資料。未穩定低於 2 秒不合併、不發布。

1. 唯讀月份與名單共用當次已驗證身分／店家中繼資料；權限、功能與訂閱檢查保留。同步寫入不進入 read scope，獨立請求重新驗證。
2. 初次跨部署比較不適合歸因：原版 30 次中位數 1579.5ms、0 次超過門檻；候選 2158ms、25 次超過。候選連未修改同步階段也較慢，簡單查詢往返約由 15–17ms 增至 25–28ms，尚未證實部署差異來源。不可將這輪宣稱為效能改善。
3. 同部署對照 SHA `35b592b56f3f9a6895109fdc824205e42b173a9f`、Preview `dpl_6um2m19orcNDfKBs2Lu3ZkRr3wEQ`：月／週／日各 10 次、每次交替順序。原流程 30 次 1594–2573ms、中位數 1849ms、4 次 >=2000ms；唯讀重用 1408–2579ms、中位數 1665ms、1 次 >=2000ms。60 次完整資料雜湊逐對一致，沒有頁面錯誤。仍未通過。
4. 最慢候選樣本伺服器同步 287ms、讀取 423ms，瀏覽器 TTFB 1485ms、下載 141ms、回應後至測量 654ms，故不能只歸因資料庫。原測量包含等待測試工具觀察到 ready 的時間；後續加上瀏覽器 MutationObserver + 兩個 frame 的當下就緒時間、long-task 與測量延遲，區分畫面工作與工具觀察延遲。
5. 下一候選將月份課程與批次名單的關聯讀取明確改為 join，減少單連線上的多次往返。僅於唯讀 month scope 啟用；QA baseline、獨立名單與寫入流程保留原查詢策略，回傳欄位與排序不改。效能及完整資料一致性尚待新 Preview 驗證，不能以程式修改推定改善。

QA 比較標頭僅在指定專案、精確分支及通過隔離 DB preflight 的 Preview 生效；正式／其他分支忽略。沒有部署分享憑證、帳密或業務 payload 進入本報告。完整計時見鄰近 JSON，正式站仍維持既有版本。
