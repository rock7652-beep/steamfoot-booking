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

## 查詢合併與連線池診斷

應用版本 `c96afbaa444ff9e94451d7bab8de9bd12eef320e` 的完整 CI 與隔離 PostgreSQL 驗收通過。

- pool=1 同部署比較 60 次，原流程中位數 1837.5ms、3/30 >=2000ms；唯讀重用 + join 1638.5ms、1/30 >=2000ms（最大2096ms）。30 對完整 DTO 雜湊一致。該超時樣本未出現前端 long task，同步 632ms、讀取507ms；較慢子段包含店家解析120.5ms、課次存在性批次145.1ms。
- 實際數字型回應標頭確認 baseLimit=1、effectiveLimit=1。隔離 DB 連線用量快照9/60、active1，狀態 ACTIVE_HEALTHY；DB 與函數皆東京。CourseSession 的 storeId/requestKey/requestIndex 複合唯一索引存在，沒有補索引或改 schema。相關正規化 SQL 類型的彙總執行統計通常低於1ms，不能將應用 span 全部當作 SQL 執行或憑此宣稱已精確辨認單次連線等待。
- 僅精確 Preview 分支新增 plain `DATABASE_CONNECTION_LIMIT=2`，不變更正式環境或 DB 全域上限。相同應用 SHA，Preview `dpl_GV4AuezD3tsx3fGcxssJpykTyGVU`，每筆確認 effectiveLimit=2。桌機1440×900、1024×900及768×1024各30次（1024寬度的效能樣本高度900，不能當作標準iPad橫向驗收；另外截圖檢查使用1024×768）（月／週／日各10）共90次完整資料一致、無頁面錯誤，另外的1024×768與768×1024版面檢查無水平溢出。結果仍未通過，不能將這項 Preview 設定當成正式可發布。

| 寬度 | 樣本 | 範圍ms | 中位數ms | >=2000ms |
|---|---:|---:|---:|---:|
| 1440 | 30 | 1219–2594 | 1496.5 | 1 |
| 1024 | 30 | 1078–1725 | 1530 | 0 |
| 768 | 30 | 1223–2430 | 1512 | 2 |

桌機2594ms樣本的伺服器總計597ms，但觀測到521/137/175/90ms前端長任務；直向2430ms樣本伺服器685ms，前端長任務719/76ms。獨立 CPU／timeline 診斷另外看見 GC、HitTest及Layout；工具剖析會增加負擔，其數字不列入90次驗收。另有診斷樣本伺服器665ms而TTFB5290ms，表示傳輸／平台等待亦可能支配單次體驗，不能全部歸因單一 SQL 或 React 元件。

接續的前端修正：讓未變的店家課表、篩選與點名衍生陣列保留引用，避免同資料每次 render 重建陣列、重啟 schedule board 的版面追蹤 effect。資料／店家／任一篩選／取消名單／點名狀態變更仍重新計算。不保存跨請求金融資料。78項相關回歸、ESLint及完整TypeScript通過；新Preview驗收尚待完成。

## 最終應用候選與未通過的門檻

應用 SHA `f7c3845d7b3594cd7309681b44bc90bfb243e0da`，Preview `dpl_5kE5YmkTdadNhMV3yzBnjut2zE9A`，READY；精確分支的 client pool override=2。78項相關測試、ESLint、完整TypeScript及[完整CI](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41655042459)、[隔離PostgreSQL驗收](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41655042383)通過。

新前端候選跑標準桌機／iPad三尺寸，月／週／日各10次，每筆均使用瀏覽器當下完整名單ready標記+兩個frame計時，逐筆確認完整DTO雜湊、實際pool=2及正確月份／店家／名單數。90次資料一致，無頁面錯誤；各尺寸各模式均無全頁水平溢出，另人工檢視三尺寸截圖。Chromium模擬不等於實體Safari/iPad驗收，沒有做點名／收款／購買等寫入。

| 尺寸 | 樣本 | 最小ms | 中位數ms | 最大ms | >=2000ms |
|---|---:|---:|---:|---:|---:|
| 1440×900 | 30 | 1340 | 1614 | 18679 | 2 |
| 1024×768 | 30 | 1292 | 1552.5 | 2090 | 1 |
| 768×1024 | 30 | 1295 | 1578 | 1750 | 0 |

**90次中3次未通過；不上線、不合併。不得剔除超時、用中位數宣布通過，亦不得宣稱前端memo已被證實改善完整點擊時間。**

最慢18.679秒樣本：同步355ms、月份讀取379ms（伺服器總計734ms）、Proxy35ms；瀏覽器發送前1174ms、TTFB7328ms、下載2804ms、回應後7373ms，long task包含4245ms。這證明同一次異常涵蓋多個階段，但不能單憑Server-Timing斷言其餘時間完全屬於某一網路或瀏覽器原因。

獨立診斷20次（不納入90次門檻）另在Playwright所在Node程序放50ms心跳，未執行React／課表程式；共觀察13次>100ms額外排程延遲，最大432ms，單次量測視窗cgroup CPU節流最多253ms。兩次超時2332/2429ms亦伴隨Node心跳停頓，顯示驗收機排程會干擾；仍不能據此免除超時或證明正式站已穩定。現有工具沒有可連線的獨立本機瀏覽器入口，尚缺獨立環境對照，故保留門檻阻擋。

### 清理與交付

- 既有QA User恢復SUSPENDED、passwordHash=NULL，綁定Staff恢復INACTIVE，另次查詢核對完成。隔離測試店有效課次仍240筆；本次未新增手動預約、方案或收款。
- 本次6個Preview臨時分享連結均撤銷、不重新產生；本機臨時帳密與分享設定檔移除。
- 非機密分支專用Preview旗標及DATABASE_CONNECTION_LIMIT=2保留供重現；未改正式環境、正式部署、DB schema／全域連線上限或通知。
- 鄰近JSON保存最終90次與獨立心跳診斷。詳盡本地診斷及可重跑腳本位於`/workspace/calendar-performance-readout/20261103-optimization/`，不含密碼、分享憑證或業務payload；須重新建立合法QA存取後才能重跑，不能以停用帳號直接執行。
- 音樂／美業沒有本次新版相同90次速度驗收，不能擴大宣稱全模組達標；正式版本仍維持既有部署，PR #1502保持Draft。下一步由執行者在可用的獨立驗收端分開核對傳輸等待、瀏覽器／驗收機排程及剩餘應用耗時，取得穩定證據前不發布。
