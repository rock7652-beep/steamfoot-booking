# 蒸管家經營指標資料 Audit

本文件只記錄 Repository 中可觀察到的資料結構、既有使用點與缺口，不提供 SQL、不修改 query，也不假設 production 資料完整。Readiness 結論見 [經營指標 Data Readiness](./business-metrics-readiness.md)。

## Audit 範圍與方法

- 檢查 `prisma/schema.prisma` 的模型、enum、關聯與索引。
- 檢查既有 reports、advanced reports、客流、體驗、交易、轉介紹與 identity 程式的欄位使用方式。
- 欄位存在只代表「可記錄」，不代表歷史資料已完整回填或商業定義已定案。
- 未連線 production DB，也未讀取、修改或 backfill production data。
- 本文件不包含 SQL 或新 query 設計。

## Model Audit

### Customer

可用欄位與關聯：

- `id`、`storeId`：店內顧客識別；同一自然人跨店可能有多筆 Customer。
- `createdAt`：Customer row 建立時間，不等於首次預約或首次完成服務。
- `firstVisitAt`：nullable 首次到店快照。
- `lastVisitAt`：nullable 最近消費／到店快照。既有 customer query 明確註記 production 多數可能 stale/null，不能作正式客流 KPI 的唯一資料源。
- `convertedAt`：nullable 首次購課快照。trial follow-up 已用有效 PACKAGE wallet 作 fallback，表示單靠此欄位可能漏判已購方案顧客。
- `customerStage`：LEAD、TRIAL、ACTIVE、INACTIVE 的目前狀態，不是歷史事件序列，不能單獨還原每月流量或成交。
- `assignedStaffId`：顧客直屬人員；不必然等於實際服務人員或成交人員。
- `mergedIntoCustomerId`、`mergedAt`：顧客合併資訊。KPI distinct customer 必須排除或歸併 source row。
- `sponsorId`、`referralCode`、Referral relations：支援部分會員介紹關係。
- `authSource`：GOOGLE、LINE、EMAIL、MANUAL，代表帳號登入或建檔通道，不是行銷獲客來源。

結論：

- `firstVisitAt`：`PARTIAL`。可交叉驗證，正式新客應以最早 COMPLETED Booking 為主要事件。
- `lastVisitAt`：`PARTIAL/LOW`。欄位存在但已有 stale/null 警告。
- `convertedAt`：`PARTIAL`。需與有效 PACKAGE_PURCHASE／wallet 對照。
- `createdAt`：`READY` 作 row audit，`NOT SUITABLE` 作新客定義。
- `customerStage`：`READY` 作目前狀態，`NOT SUITABLE` 單獨計算歷史 KPI。

### Booking

可用欄位與關聯：

- `bookingType`：FIRST_TRIAL、SINGLE、PACKAGE_SESSION。
- `bookingStatus`：PENDING、CONFIRMED、COMPLETED、CANCELLED、NO_SHOW。
- `bookingDate`、`slotTime`：服務業務日期及時段；`bookingDate` 是 Date-only 欄位。
- `createdAt`、`updatedAt`：row 建立及最後更新時間，不是可靠的「完成時間」。
- `people`：原始預約人數，範圍可大於 1。
- `attendedPeople`：FIRST_TRIAL 實際到店人數；nullable 時向後相容為全到，但歷史資料品質需驗證。
- `customerId`、`storeId`：客流 distinct 與店舖切分基礎。
- `serviceStaffId`：實際服務人員，nullable。
- `revenueStaffId`：營收歸屬人員，nullable，語意不同於 service staff。
- `bookedByStaffId`：代為建立預約的人員，不等於服務或成交人員。
- `servicePlanId`、`customerPlanWalletId`：方案與 wallet 關聯，可能 nullable。
- Booking 與 Transaction、WalletSession、ReferralEvent 有關聯。

特別結論：

- FIRST_TRIAL：`READY` 作體驗類型識別。
- COMPLETED／CANCELLED／NO_SHOW：`READY` 作目前最終狀態分類；若狀態曾回退，Booking 本身不提供完整狀態歷史時間線。
- people／attendedPeople：`PARTIAL`。足以支援多人 audit，但 KPI 分母規則與歷史 null 尚未確認。
- coach／staff：`PARTIAL`。有多種角色，需商業歸屬定義。
- store：`READY` 作 Booking 所屬店舖。
- 完成時間：`MISSING`。Booking 沒有專用 `completedAt`；`bookingDate` 是服務日期，`updatedAt` 可能被其他更新改寫。WalletSession 有 completedAt，但只涵蓋掛 wallet session 的情境，不能假設覆蓋所有服務。

### Transaction

可用欄位與關聯：

- `transactionType`：TRIAL_PURCHASE、SINGLE_PURCHASE、PACKAGE_PURCHASE、SESSION_DEDUCTION、SUPPLEMENT、REFUND、ADJUSTMENT 等。
- `amount`、`grossAmount`、`discountAmount`、`netAmount`：金額欄位；不同報表版本使用欄位需依既有共用常數與規格統一。
- `status`：SUCCESS、CANCELLED、REFUNDED、VOIDED。
- `paymentStatus`、`paidAt`：付款是否成功／確認及確認時間。
- `transactionDate`、`createdAt`：業務日期與 row 建立時間。
- `refundOfTransactionId`、`refundedAt`、退款 back-relation：退款可追溯原交易。
- `paymentMethod`：CASH、TRANSFER、LINE_PAY、CREDIT_CARD、OTHER。
- `bookingId`、`customerId`、`storeId`：可連結體驗、顧客與店舖。
- `planId`、`planNameSnapshot`、`planType`、`customerPlanWalletId`：方案與 wallet 線索。
- `revenueStaffId`、`serviceStaffId`、`soldByStaffId`：營收、服務、成交三種不同人員語意。
- `isFirstPurchase`：首次購買快照；是否完整且符合「完成體驗當天正式方案」需另行資料 audit。

結論：營收、退款、淨收及人員營收的核心欄位 `READY/HIGH`。同日開卡為 `PARTIAL`：事件可關聯，但仍須確認有效付款、VOID／REFUND、正式方案、重複購買與跨店規則。

### Wallet

`CustomerPlanWallet` 有 customer、store、plan、purchasedPrice、totalSessions、remainingSessions、startDate、expiryDate、status、createdAt，並關聯 Transaction、Booking 與 WalletSession。

- 可觀察方案購買後的權益及歷史 wallet。
- `remainingSessions` 是 cached 欄位，實作留存 KPI 前需驗證與 WalletSession 的一致性。
- status 反映目前 ACTIVE／USED_UP／EXPIRED／CANCELLED，不自帶每次狀態變更歷史。
- wallet 建立不必然等同有效成交；需連回有效付款 Transaction。

結論：續約資料候選 `PARTIAL`，但續約率仍為 `UNKNOWN`，因商業分母與視窗未定義。

### Package / ServicePlan

`ServicePlan` 有店舖、名稱、category（TRIAL、SINGLE、PACKAGE）、價格、堂數、效期、啟用狀態與 wallet／booking／transaction relations。Transaction 另有 plan snapshots。

- `PlanCategory.PACKAGE` 可作正式方案候選識別。
- 歷史交易可使用 snapshot，但 plan relation／snapshot 的完整性需 audit。
- 方案改名、停用或跨方案續購不應由名稱文字判斷。

結論：正式方案辨識 `PARTIAL/MEDIUM`，可進 KPI-4 read-only data audit，尚不能宣稱開卡 KPI READY。

### Referral

- `Referral` 有 `referrerId`、被介紹人姓名／電話、status、`convertedCustomerId`、store 與時間。
- `Customer.sponsorId` 提供自我參照推薦關係。
- `ReferralEvent` 有 customer、referrer、store、booking、event type 與 nullable `source` 字串。
- ReferralEvent 已用於分享、完成預約與轉介紹統計，但不是通用 acquisition source 模型。

結論：結構化「會員介紹」`PARTIAL`；歸屬時點、converted link 完整性、跨店與 event source 字串品質需驗證。員工介紹沒有等價的可靠結構。

### Store

Store 提供每筆 Customer、Booking、Transaction、Wallet、Referral 的店舖關聯，是店舖切分基礎。另有 parent／view context 與多店能力；同一自然人跨店可能有不同 Customer id。

結論：單店切分 `READY`；跨店 distinct customer、服務店與成交店的歸屬 `PARTIAL`。

### Staff

Staff 與 Customer assigned staff、Booking service／revenue／booked-by staff、Transaction revenue／service／sold-by staff 均有不同關聯。

結論：人員維度欄位存在，但不能混用。人員營收採 revenueStaff 時 `READY`；體驗、開卡與回流仍需唯一歸屬定義。

### Customer Identity Link

`CustomerIdentityLink` 保存 store-scoped provider identity，服務 LINE／OAuth 身份連結與同店 identity truth。Customer 另有合併欄位。

- 可協助同店身份一致性與重複 Customer audit。
- 不是跨店自然人 master identity，也不是獲客來源。
- 不應直接把 identity provider 當行銷來源。

結論：同店身份 audit `PARTIAL`；跨店顧客去重仍缺正式規則。

## Customer Source Audit

| 候選來源 | 正式結構化來源欄位 | Audit 結論 |
| --- | --- | --- |
| Google | MISSING | `authSource=GOOGLE` 是 Google OAuth／帳號證據，不代表顧客由 Google 行銷獲得 |
| LINE | MISSING | LINE login、lineUserId、Identity Link 代表身份／通道，不代表獲客歸因 |
| Instagram / IG | MISSING | 未找到正式欄位或 enum |
| Facebook / FB | MISSING | 未找到正式欄位或 enum |
| 路過 | MISSING | 未找到正式欄位或 enum |
| 活動／Campaign | MISSING | discountReason 或自由文字不能視為正式 campaign attribution |
| 陌生客 | MISSING / TBD | 無結構化欄位，商業定義未確認 |
| 緣故客 | MISSING / TBD | 無結構化欄位，商業定義未確認 |
| 會員介紹 | PARTIAL | Referral、ReferralEvent、sponsorId 可用，但需歸屬與完整性 audit |
| 員工介紹 | MISSING | 未找到可靠的 referrer staff 結構 |

結論：Repository 目前沒有可直接支援正式開發來源 KPI 切分的完整欄位。不得以 `authSource`、LINE 綁定、notes 或 discountReason 代替。

## Tag Audit

| 結構 | 是否存在 | 是否可作正式來源統計 | 說明 |
| --- | --- | --- | --- |
| Customer Tag model／relation | 未找到 | 否 | Prisma schema 無正式 CustomerTag 關聯 |
| Customer Label | 未找到正式持久化結構 | 否 | UI 或 query 衍生名稱不等於資料模型 |
| Growth tags | 存在於 runtime query | 否 | 依狀態即時計算，用於營運提示，不是獲客來源 |
| Marketing Source | 未找到 | 否 | authSource 是身份／建檔通道 |
| Campaign | 未找到正式 attribution model | 否 | 自由文字活動名或折扣原因不可直接統計 |
| notes／note／serviceNote | 存在 | 否 | 自由文字，無受控字典、必填或一致性保證 |

若未來導入來源或標籤，需先決定單選／多選、受控值、首次來源／成交歸因、歷史變更、跨店共享與資料回填策略。

## KPI-by-KPI Audit

| KPI | 結論 | 主要原因 |
| --- | --- | --- |
| 本月來客數 | READY | COMPLETED Booking 可依店舖、月份、customer distinct |
| 新客數 | PARTIAL | 事件可比對，但歷史完整性、合併與跨店首次需驗證 |
| 舊客數 | PARTIAL | 本期／歷史完成服務可交集，但同樣受身份與歷史品質影響 |
| 回流率 | UNKNOWN | 正式分母與觀察窗未定義 |
| 體驗人數 | PARTIAL | FIRST_TRIAL 與完成狀態存在；人數／人次及多人規則未定 |
| 開卡人數 | PARTIAL | 體驗與正式方案交易可關聯；同日與有效交易規則待 audit |
| 開卡率 | PARTIAL | 分母與 edge cases 未定；現有 conversion 不是同日口徑 |
| 續約率 | UNKNOWN | 有 wallet／購買資料，但正式分母與視窗未定 |
| 未續約率 | UNKNOWN | 成立時點與公式未定 |
| 平均回店天數 | UNKNOWN | 完成事件存在，但統計口徑未定 |
| 本月營收 | READY | Transaction 與共用有效收入類型／狀態可用 |
| 退款 | READY | REFUND transaction 與原交易追溯欄位可用 |
| 淨收 | READY | 既有收入加 REFUND 淨額口徑可用 |
| 人員營收 | READY | revenueStaffId 與有效交易可用 |
| 人員體驗 | PARTIAL | FIRST_TRIAL 可用，人員角色與人數口徑待定 |
| 人員開卡 | PARTIAL | 事件與人員欄位存在，成交歸屬與同日規則待定 |
| 人員回流 | UNKNOWN | 全店回流尚未定案，人員歸屬亦未定 |

## 建議的下一步

1. KPI-3 先以 read-only 測試資料驗證本月來客數，再處理新客、舊客、多人與跨店。
2. KPI-4 在寫 query 前先完成同日開卡 edge-case 決策與 Transaction／Wallet 關聯品質 audit。
3. KPI-5 暫停開發，先由業務確認回流、續約、未續約及平均回店天數定義。
4. 來源維度另開資料設計議題；未有結構化欄位前不做來源 KPI。
5. 人員 KPI 先決定 service staff、revenue staff、sold-by 或 assigned staff 的唯一語意。
