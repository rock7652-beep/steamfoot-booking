# 課表分段計時與固定課核對優化

日期：2026-10-30（Asia/Taipei）。沿用 `perf/sports-course-loading`、[Draft PR #1470](https://github.com/rock7652-beep/steamfoot-booking/pull/1470)。不合併main、不部署正式站。

## 量測定義

- 伺服器計時從 CoursesPage 開始到其資料準備完成，分為access、profile、ensure_month、pre_calendar、calendar_batch、post_calendar、presentation。這不涵蓋完整父layout、React後續渲染或網路。
- 每個read記錄其開始位置與wall time，包含服務呼叫／連線池排隊／查詢等待，不能視為Postgres引擎執行時間。
- phases連續且互不重疊；reads可能並行且包含在phases中，不能將兩者重複加總。各階段中位數之和也不一定等於總時間中位數。
- 驗證標頭使用Playwright routing限同origin注入；Playwright文件明示routing會停用HTTP cache。因此warmup只表示排除初次冷啟動，不能冒稱瀏覽器熱快取；每次導覽仍會重載前端資源。
- 瀏覽器另記錄request-to-first-byte、response transfer window、responseEnd、DOMContentLoaded及load。它們與伺服器計時是重疊的時間軸，不能直接相加或將差額全部稱為前端耗時。
- 明細只在指定分支的Vercel Preview、sports-live-flow-store、OWNER正常授權完成、顯式perf=1時附在非執行JSON中。正式站、其他店及角色沒有輸出；不包含學員、SQL、帳號或錯誤內容。不記全域狀態、不改權限或快取資料。

## 量測基準

- 計時基準應用程式 `423fa1516701534ce5f238d6238cf26f1b8fb4c9`：<https://steamfoot-booking-6yf4dv4ww-rock7652-2111s-projects.vercel.app>。
- 後續 `00c6fe1a` 僅修正計時環境參數的TypeScript型別並加入重跑腳本，未改應用程式執行行為。基準初次CI型別失敗已修正，未將其誤列全綠。
- 同一已授權隔離店QA1469帳號、同一2026-11-27課表，1次warmup＋4次採樣。正常登入，使用工作區proxy，不代表銀百合現場或實體裝置。
- 原流程伺服器資料準備中位數1210.35ms；access329.85ms、固定課核對321.25ms、pre-calendar173.5ms、主要課表整批93.95ms、post-calendar99.7ms、presentation144.5ms。登入／門市與固定課為最大兩段。
- 保留完整權限／門市檢查；優先優化接近最大且可消除重複資料庫往返的固定課核對，不將主要課表查詢當作主要瓶頸。

## 本次固定課修改

原本對每個有效固定系列依次count；改為投影requestKey／requestIndex並批次比對，最多250個待核對系列一批。隔離資料有20個stored／active系列，但需核對數量仍依原日期／週期／例外規則判定，不宣稱所有系列每次都有課。

仍使用原fixedSeriesOccurrenceOnDate及ordinal計算；查詢不新增cancelledAt、releasedAt或startsAt條件，保留「取消／移動的原課次仍視為已建立」；不存在才交給原materializer。保留缺席釋放、訂閱唯讀、readiness、停止／排除日期、額度、容量警告及交易錯誤傳遞。沒有移除生成流程或以快取替代核對。

[53項固定課／頁面／計時回歸](sports-course-stages-20261030/coverage-tests.log)通過，含100系列只一批、251系列有界分批、缺課次、隔週／排除／停止／取消、相同索引的精確列數、容量警告及既有訂閱隔離。

中間批次版應用程式：`5d91a272e52d8b01b5a0f4d2653edf0bc53bdc72`；<https://steamfoot-booking-hvavldo4z-rock7652-2111s-projects.vercel.app>。

中間版雖將固定課核對中位數321.25→241.5ms，但整頁資料準備1210.35→1379.7ms、瀏覽器2541.5→2689ms，本輪沒有整頁改善；不隱藏這組結果。後段標籤／顯示等待變長，因此再調整等待順序。

最終應用程式 `cc999740ac4db1678887872a79e6211b2cef2afb`：<https://steamfoot-booking-opd9gqiyx-rock7652-2111s-projects.vercel.app>，部署dpl_3tYoaPVpgHSw3noFTUDKSft2AV3M，READY。

最終版在已取得本店可見學員ID後，讓原授權標籤服務與方案名稱／排課模式metadata讀取重疊候補／排序準備。僅限sportsNative；音樂保留原順序與redirect前不讀取的行為。原Promise錯誤仍於await拋出，沒有吞掉標籤授權錯誤或以快取取代權限。

| 階段中位數（ms，排除warmup各4筆） | 計時基準 | 最終版 |
| --- | --- | --- |
| access | 329.85 | 301.35 |
| profile | 58.25 | 48.25 |
| ensure_month | 321.25 | 207.3 |
| pre_calendar | 173.5 | 69.45 |
| calendar_batch | 93.95 | 107.5 |
| post_calendar | 99.7 | 124.35 |
| presentation | 144.5 | 112.4 |
| server_total | 1210.35 | 1031.85 |
| browser_elapsed | 2541.5 | 2777.5 |

伺服器資料準備中位數下降約14.7%，固定課約35.5%；整頁elapsed本輪反而高約9.3%，不能宣稱整頁或店家體感改善。HTTP快取關閉、不同Preview執行個體、proxy、資源下載及環境負載均未完全受控，樣本少，不做顯著性／因果保證。

「presentation」是晚到await剩餘的連續等待；最終read已提前與post_calendar重疊，不能只看這個phase推斷標籤服務本身變快。原始read起訖位置完整保留。

[基準](sports-course-stages-20261030/baseline.json)、[中間版](sports-course-stages-20261030/intermediate-batch.json)、[最終版](sports-course-stages-20261030/optimized.json)、[比較](sports-course-stages-20261030/comparison.json)。UI測試與最終速度樣本依序執行；與UI同時執行的第一輪樣本未混入比較。

可見課表36張卡片的摘要SHA-256與基準相同（只代表可見卡片一致，不代替所有業務欄位稽核）。診斷在未帶perf=1時不存在。桌機1366／1920、iPad1024×768／768×1024、草稿保留、一次在途預讀、關閉不額外讀取、錯誤重試、跨店拒絕均通過：[UI結果](sports-course-stages-20261030/ui.json)。同目錄附實際隔離系統截圖。

[最後34項回歸](sports-course-stages-20261030/final-regression.log)另確認音樂設定redirect前不提前讀取標籤，以及並行標籤授權錯誤仍向外傳遞。本機tsc通過；最終受測app的 [CI](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/40997056837) Typecheck、Targeted、Full Vitest、ESLint與隔離PostgreSQL audit通過。後續證據與測試提交沒有改應用程式行為。

驗收後QA1469運動User=SUSPENDED、passwordHash=NULL、Staff=INACTIVE，本機臨時密碼JSON移除。沒有提交新增排課或操作正式資料。


## 驗收界線

正常登入的隔離系統＋合成資料，不代替銀百合實際業務、實體iPad／Safari或真實新增排課交易驗收。舊的2.57秒是先前不同批次樣本；本輪以帶同一計時的基準與優化版配對，不混用數字。
