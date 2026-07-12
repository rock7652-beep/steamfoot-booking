# CRM-LINK Roadmap

## 原則

Dashboard count 與顧客名單必須源自同一個 customerId selection。每一階段先抽出共用商業選取邏輯，再接 count 與 list；不得在 UI、page component 或另一支 CRM query 複製條件。

## CRM-LINK-1｜未開卡名單

建議作為第一支功能 PR，但不是直接連到現有「體驗未轉換」。

- 從 KPI-4 抽出指定 `storeId + month` 的完成體驗 cohort、同日有效開卡集合及未開卡差集。
- `getConversionMetrics` 與新未開卡名單共用 selection。
- KPI「未開卡人數」可點擊後，名單 distinct customerId 數必須等於卡片 current 值。
- 名單顯示體驗完成日與可理解的未開卡原因；不改既有顧客經營「待追蹤體驗客」的商業語意。
- 維持 active/viewed store isolation；不做 HQ all-store。
- Regression test 必須以同一 fixture 同時斷言 KPI count 與名單 customerId。

## CRM-LINK-2｜未回流名單

- 從 KPI-5 抽出上月完成服務 cohort、本月回流交集與未回流差集。
- 讓 KPI-5 aggregation 與「上月顧客本月未回流」名單共用 selection。
- 不重用或改寫「好久不見」；30 天且有有效方案的提醒繼續作為獨立工作名單。
- KPI「本月未回流人數」可點擊，下鑽名單數必須完全一致。

## CRM-LINK-3｜生日名單

- 以 Customer `birthday` 建立獨立 CRM 維度與名單。
- 先定義店舖時區、月份／日期範圍及 NULL 處理，再做 UI。
- 本階段不把生日列為 KPI，也不混入 LINE、優惠券或排程。

## CRM-LINK-4｜新客名單

- 從 KPI-3 抽出「本月首次完成服務」customerId selection。
- 不使用 Customer 建檔日、首次預約、stage 或可 stale 的 firstVisit 欄位代替。
- KPI「新客數」可點擊，名單與卡片數字使用同一 store、月份及去重規則。

## 後續候選

- 本月來客、舊客、體驗顧客與開卡名單可依相同 selection contract 逐項接入。
- 若未來支援 HQ all-store，必須先正式決定跨店 customer identity 與去重規則，不能把各店數字直接相加後宣稱是唯一顧客數。

## 每支功能 PR 的完成條件

1. 商業口徑引用既有 KPI 規格，不在 PR 內另創定義。
2. selection helper 是 count 與 list 的唯一條件來源。
3. active store、viewed store、月份邊界與 Asia/Taipei 規則一致。
4. count/list parity regression test 通過。
5. 不順便改其他 CRM 名單、KPI、entitlement、route 或資料模型。

## CRM-LINK-1 建議

第一支應優先做「未開卡人數 → 未開卡顧客名單」，因為它是最直接的經營待辦。但實作前必須先將 KPI-4 的 cohort、converted 與 unconverted customerId selection 抽成共用 read model；直接導向現有 `getTrialFollowUpList` 會產生不同數字，不符合 Single Source of Truth。
