# 運動／舞蹈課表及教學項目載入優化

後續分段計時、進一步調整及最新Preview見 [分段驗收紀錄](sports-course-stages-20261030.md)；本文件保留第一輪基準與結果。

日期：2026-10-30（Asia/Taipei）。獨立分支 `perf/sports-course-loading`；[PR #1470](https://github.com/rock7652-beep/steamfoot-booking/pull/1470)，維持 Draft。基於 main `c95fa19e`，不包含方案餘額 PR #1469。

## 修改及保留的規則

- 教學項目規則改用 `readSportsTeachingRules`：template、有效授課教練、預設計酬各一批，固定三次查詢。仍在同一 transaction 內讀取；保留同店、ACTIVE、courseCoachEnabled、資格、排序、缺模板與無效計酬預設。單項儲存的修訂核對函式未改。
- 課表不再執行 `loadSportsStaging(true)`，不預載完整方案／卡／會員／保留預約快照。原排課視窗先顯示，點開後使用共用 panel reader → 同源 schedule-options GET → 原 loader。指向操作入口的 pointer／focus／touch intent 只共用在途請求，TTL 0。
- 讀取失敗在原視窗重試；關閉／換作用域的晚到回應不覆寫，載入完成後維持同一表單草稿。外部美業等模組已傳入的 initial props 直接使用，不再讀取運動資料。
- 視窗開啟及關閉還原焦點時不啟動額外預讀。讀取範圍使用門市與入口，不把頁面現在時間當作資料修訂；仍保持TTL 0，每次重新開啟取得最新資料。
- 保留 `ensureSportsMonth`、readiness、模組／店家／四項資料權限、唯讀限制、後端設定／衝突與額度核對。排課讀取仍不回傳計酬；未修改扣堂、效期或排程生成規則。
- 不調整資料庫連線池、不新增快取財務資料、不新增 schema／migration／套件。

## 可重現的查詢差異

銀百合唯讀調查確認有10個 canonical教學項目，原規則讀取每項3次，改為3批：30 → 3（減少90%），不含頁面的其他查詢。100項含缺模板、重複ID、無效計酬及資格排序的合成測試驗證結果與固定查詢數。

速度驗收使用既有隔離運動店：6個項目，其中3個canonical項目；原規則查詢為12次（存在者3次、缺模板者1次），改為3次。不可把這個資料集當作銀百合的真實資料。

## 程式驗證

- 9個檔案、89項目標及Preview隔離測試通過：[log](sports-course-loading-20261030/targeted-tests.log)。
- 焦點保護後排課UI／loader／頁面回歸3個檔案26項通過：[log](sports-course-loading-20261030/focus-tests.log)。
- 穩定scope後3個檔案27項通過，包含父頁刷新不重啟在途請求：[log](sports-course-loading-20261030/stable-scope-tests.log)。
- 本機 tsc 通過；ESLint無錯誤，page.tsx 原有 showLubyReplica 未使用警告保留。
- 新測試納入CI，涵蓋沒有完整排課資料仍可載入課表、原授權loader／no-store、失敗重試、晚到回應、外部props、初始化後草稿，以及批次查詢結果。

## 隔離 Preview 與登入驗收

- Baseline：`e35831e29b8211961bdf4e294bc793a430f76f54`，僅加入隔離設定，沒有功能優化。<https://steamfoot-booking-ilpfaqcu6-rock7652-2111s-projects.vercel.app>
- 優化版：`0ad8878d8f5768f9e764ff67cdfd63695fe25c62`。<https://steamfoot-booking-p5qyiqifq-rock7652-2111s-projects.vercel.app>
- 同一Vercel專案、hnd1、同一分支設定與 steamfoot-preview 資料庫。兩個非機密開關只限本分支Preview：SPORTS_REDESIGN_STAGING=1、SPORTS_REDESIGN_PREVIEW=1。
- 手動部署 API 未提供 target，回傳 target=null；不使用 staging 共用別名或 production。建置須確認 isolated_database=true、migrations_skipped=true、notifications_blocked=true。
- 正常登入先前授權的隔離 `sports-live-flow-store` QA1469帳號，僅做讀取、草稿與錯誤模擬；沒有提交新排課或修改正式業務資料。每頁先1次warmup，再3次採樣；瀏覽器經工作區proxy，不能代表門市網路。
- 可重跑腳本：`scripts/qa/sports-course-loading-browser.mjs`。登入資料由受保護本機 JSON 提供，不含在證據或儲存庫；Vercel短期OIDC僅送往精確受測Preview origin。

### 正常登入隔離驗收結果

優化Preview READY，部署 `dpl_AkPLiwg3VEgRzUBhgBqz7UM3RjMi`。最終受測應用程式 `0ad8878d`；後續證據提交只更新文件／圖片。建置確認 isolated_database=true、migrations_skipped=true、notifications_blocked=true。

- 課表未要求schedule-options資料；點開先顯示外框／loading，再啟用完整表單。
- intent與開啟共用一個在途GET；關閉焦點還原不額外預讀；錯誤模擬後同視窗重試成功。
- 排課視窗與教學項目清單：1366×900、1920×1080、1024×768、768×1024均無整頁水平溢出；旋轉／resize後時間草稿仍為10:30，關閉按鈕可操作。
- 跨店讀取拒絕，沒有回傳其他店的排課metadata；沒有pageerror。
- [基準原始數據](sports-course-loading-20261030/baseline.json)、[優化原始數據](sports-course-loading-20261030/optimized.json)、[統計](sports-course-loading-20261030/comparison.json)。同目錄附教學項目與排課桌機／iPad截圖。

| 相同隔離資料、3次非warmup採樣中位數 | 優化前 | 優化後 |
| --- | --- | --- |
| 教學項目 | 2534 ms | 2747 ms |
| 課表 | 3459 ms | 2572 ms |

課表的初步觀察改善約25.6%。教學項目的整頁中位數本輪反而高8.4%，未呈現畫面加速；兩組範圍重疊且樣本少，不能判定穩定退步或成效。查詢次數下降不等於已證明畫面加速，仍須銀百合實際網路與較多樣本量測。樣本少、經proxy、分開的Preview執行個體；不作統計顯著性或正式門市速度保證。

解壓後頁面HTML／RSC由282,813 bytes降為234,617 bytes，減少48,196 bytes（約17%）；這不是壓縮後的網路傳輸量，實際encodedBodySize另列於JSON。

應用程式提交 `0ad8878d` 的 [CI](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/40993801622)：Full Vitest baseline、Targeted tests、Typecheck、Changed-file ESLint通過。Vercel Preview READY；Workers外部check另列於下方，未宣稱全部checks全綠。

驗收結束已將QA1469運動User設為SUSPENDED、移除passwordHash，對應Staff設為INACTIVE；瀏覽器context關閉，本機臨時密碼JSON已移除。未動其他店／帳號。


## 驗收界線及外部檢查

- 正常登入的隔離系統＋合成資料與銀百合實際業務簽核分開；未使用銀百合帳號進行正式實測，也未驗實體iPad／Safari。
- 單元測試保留原排課提交及權限規則；本輪hosted流程沒有提交新增排課，不宣稱完成真實排課交易驗收。
- Cloudflare Workers外部check失敗；GitHub輸出只有build ID，尚未取得該平台建置日誌，不能斷言其精確失敗原因。現有程式在 migration／DB client 建立前拒絕不符Vercel來源的Preview；本次未開放Workers部署或修改其設定。Vercel隔離Preview及應用程式CI分列，不能宣稱所有外部checks全綠。
- PR維持Draft；不合併main、不部署正式站。
