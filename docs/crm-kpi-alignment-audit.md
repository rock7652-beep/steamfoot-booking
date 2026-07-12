# CRM 與 KPI 口徑對齊 Audit

## 目的

本文件盤點營運分析 KPI 與顧客經營名單的資料來源及商業定義，建立後續 Single Source of Truth 的基準。結論只描述目前 repository；本 PR 不修改 Query、UI、DB 或正式資料。

判定標準：

- **YES**：同一商業母體、條件、期間、店舖隔離與去重規則，且共用同一查詢或共用 selection helper。
- **PARTIAL**：概念相關，但母體、時間窗或資格條件至少一項不同。
- **NO**：商業問題不同，不能把現有名單直接視為 KPI 明細。

## 現況資料流

營運分析頁 `src/app/(dashboard)/dashboard/reports/page.tsx` 分別呼叫：

- KPI-3：`src/server/queries/customer-flow-metrics.ts#getCustomerFlowMetrics`
- KPI-4：`src/server/queries/conversion-metrics.ts#getConversionMetrics`
- KPI-5：`src/server/queries/retention-metrics.ts#getRetentionMetrics`

顧客經營頁使用 `src/server/queries/customer-care.ts#getCustomerCareOverview`，其中體驗待追蹤再複用 `src/server/queries/trial-follow-up.ts#getTrialFollowUpList`。目前 KPI query 只回傳聚合數字，沒有可供 CRM 名單直接複用的 customerId selection API；因此尚未形成「同一 selection 同時產生 count 與 list」的 Single Source of Truth。

## Alignment Matrix

| Dashboard KPI | 最接近的 CRM 名單 | Dashboard Query | CRM Query | 一致 | 原因與 Action |
| --- | --- | --- | --- | --- | --- |
| 本月來客數 | 一般 Customer List | `getCustomerFlowMetrics` | 顧客列表 query | NO | KPI 是指定月、同店、`COMPLETED` Booking 的唯一 customerId；一般顧客列表是顧客主檔，不代表期間內完成服務。應新增共用 customerId selector。 |
| 新客數 | 無正式名單 | `getCustomerFlowMetrics` | 無 | NO | KPI 以「首次完成服務落在本月」判斷，不是 Customer 建檔日、首次預約或 stage。 |
| 舊客數 | 無正式名單 | `getCustomerFlowMetrics` | 無 | NO | KPI 要求本月完成服務且本月前已有完成服務；現有 CRM 沒有同口徑名單。 |
| 體驗顧客數 | 體驗未轉換／待追蹤 | `getCustomerFlowMetrics` | `getTrialFollowUpList` | NO | KPI 是指定月 `COMPLETED + FIRST_TRIAL` 的唯一 customerId；CRM 是成功 `TRIAL_PURCHASE`、`convertedAt IS NULL`、沒有有效 PACKAGE Wallet 的當下待辦，且不要求 Booking 已完成。 |
| 開卡人數 | 體驗未轉換的相反集合 | `getConversionMetrics` | `getTrialFollowUpList` | NO | KPI 要求同店同日完成體驗、成功 `PACKAGE_PURCHASE` 且 Wallet 未取消；CRM 不是從同一體驗 cohort 做補集，並用 `convertedAt` 與「目前有效 Wallet」排除。 |
| 開卡率 | 體驗未轉換 | `getConversionMetrics` | `getTrialFollowUpList` | NO | 分母不一致：KPI 分母是指定月完成 FIRST_TRIAL 顧客；CRM 母體是曾有成功體驗收款且目前待追蹤者。 |
| 未開卡人數 | 體驗未轉換 | `getConversionMetrics` | `getTrialFollowUpList` | PARTIAL | 都在找未成交體驗客，但 KPI 是指定月份體驗 cohort 減同日開卡；CRM 是無固定月份的當下追蹤工作池。不可直接串接。 |
| 本月回流人數 | 好久不見 | `getRetentionMetrics` | `getCustomerCareOverview` | NO | KPI 是上月完成服務 cohort 中本月再次完成者；好久不見是擁有有效 PACKAGE、最後完成服務距今超過 30 天者，方向相反且多了方案資格。 |
| 上月顧客回流率 | 好久不見 | `getRetentionMetrics` | `getCustomerCareOverview` | NO | KPI 有固定月 cohort 與分母；好久不見是滾動 30 天提醒，沒有相同分母。 |
| 本月未回流人數 | 好久不見 | `getRetentionMetrics` | `getCustomerCareOverview` | PARTIAL | 都涉及未回來，但 KPI 僅限上月 cohort、本月未完成服務；好久不見要求最後服務超過 30 天且仍有有效 PACKAGE。 |
| 無對應 KPI | 堂數偏低 | 無 | `getCustomerCareOverview` | NO | Wallet 剩餘堂數提醒，非 KPI-3/4/5。 |
| 無對應 KPI | 方案快到期 | 無 | `getCustomerCareOverview` | NO | 14 天內有效 PACKAGE Wallet 到期提醒，非 KPI-3/4/5。 |
| 無對應 KPI | 待追蹤紀錄 | 無 | `CustomerFollowUp`／customer-care | NO | 人工追蹤工作紀錄，不是經營 KPI。 |
| 無對應 KPI | 生日 | 無 | Customer `birthday` | NO | 個人資料維度；本階段尚無生日 KPI 或生日 CRM 名單。 |

## KPI-3：客流

KPI-3 的共同母體是指定店舖與月份內 `bookingStatus = COMPLETED` 的 Booking，以 customerId 去重。新客／舊客另用同店最早完成服務日期分類；體驗顧客再限制 `bookingType = FIRST_TRIAL`。取消、未到與未分別建立 Customer 的同行者不計。

現有顧客經營沒有任何名單直接複用此 selection。一般 Customer List 最多可作為顯示容器，不能作為數字來源。Customer 的 `createdAt`、stage、`firstVisitAt` 或 `lastVisitAt` 也不應替代 KPI 的完成 Booking 事實。

結論：四項皆 **NO**。CRM-LINK 後續必須先把「選出符合 KPI 的 customerId」抽成共用 query，再讓 count 與 list 分別消費同一結果。

## KPI-4：成交

KPI-4 的體驗 cohort 是指定月 `COMPLETED + FIRST_TRIAL` 的唯一 customerId。開卡成立還需同店、同一台灣日 `PACKAGE_PURCHASE`、交易成功、付款成功或確認，且關聯 Wallet 不為 `CANCELLED`。未開卡是同一 cohort 減去同日開卡集合。

`getTrialFollowUpList` 則從 `TRIAL_PURCHASE` transaction 起算，要求交易成功、Customer `convertedAt` 為 null、目前沒有「ACTIVE、仍有堂數且未過期」的 PACKAGE Wallet。它不要求 FIRST_TRIAL Booking 已完成，也沒有 KPI 選定月份與同日成交邊界。正常用完或到期 Wallet 在 KPI-4 仍代表歷史開卡成立，但在待追蹤 query 的「目前有效 Wallet」判斷中可能重新進入工作池；兩者用途不同。

結論：體驗未轉換與未開卡人數只有產品語意相近，技術及商業母體 **PARTIAL**，不能讓 KPI 卡片直接連到現有名單。

## KPI-5：留存

KPI-5 以目標月份的前一月 `COMPLETED` Booking 唯一 customerId 為 cohort，再與目標月份完成服務 customerId 取交集或差集。

好久不見是以今天為基準的滾動提醒：Customer 必須有有效 PACKAGE Wallet，且最後一次完成服務距今超過 30 天。它沒有上月 cohort，也不是目標月差集。因此「回流」與「好久不見」回答不同問題：前者衡量固定 cohort 的月對月留存，後者找今天需要關心的方案顧客。

結論：本月未回流與好久不見概念相關但僅 **PARTIAL**；回流人數與回流率為 **NO**。CRM-LINK-2 應建立 KPI-5 cohort 明細名單，不應改名或重用好久不見。

## Store、期間與身分一致性

- 三組 KPI 均接受單一 `storeId`，以 Booking／Transaction 的 `storeId` 隔離；目前 reports 不支援 HQ all-store KPI。
- 顧客經營透過 `getStoreFilter(user, activeStoreId)` 支援角色與 viewed-store 視角，並額外排除合併或停用 Customer；各 KPI query 沒有相同 Customer 狀態排除。
- KPI 使用固定月區間；顧客經營多為「今天」的工作池，時間語意不同。
- 所有相關 KPI 以 customerId 去重；多人同行未各自建立 Customer 時不計。CRM 清單同樣以 Customer 為列，但體驗待追蹤的起點是 transaction，而不是完成 Booking。

即使兩邊顯示同一店舖，這些額外條件仍可能使數字不同。後續不應在 UI 以參數拼裝近似條件；應由 reports query layer 提供明確的 selection contract。

## Single Source of Truth 目標

建議每個可下鑽 KPI 形成三層共用契約：

1. selection：輸入 `storeId + month`，輸出符合正式口徑的唯一 customerId 與必要理由欄位。
2. aggregation：只對 selection 計數並產生 MoM／YoY。
3. list：以同一 selection 的 customerId 取得顧客顯示資料、分頁及權限處理。

禁止另外複製一套 where 條件給 CRM。測試必須驗證 `KPI current count === 對應名單 distinct customerId count`，並覆蓋取消、未到、跨店、重複 Booking、Wallet 取消及月份邊界。

## Audit 結論

- **完全一致（YES）**：目前沒有。
- **可對齊但需先建立共用 selection**：本月來客、新客、舊客、體驗顧客、開卡、未開卡、回流、未回流。
- **不能直接串**：一般 Customer List、現有體驗未轉換、好久不見、堂數偏低、方案快到期、生日與人工待追蹤紀錄。
- **最大風險**：若只讓 KPI 卡片連到名稱相近的既有 CRM tab，數字必然可能不一致，會破壞使用者信任。

