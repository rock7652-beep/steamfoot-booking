# 店家訂閱管理規劃（Store Subscription Management）

> 狀態：**規劃文件（Planning only）**，本階段不實作任何功能。
> 用途：作為後續實作（schema / 管理頁 / 歷史紀錄 / 金流）的依據。

> **🔴 修訂 v2（重要）**：原 v1 在不知情下把本案寫成「新建 `StoreSubscription` model」。
> 經 read-only 盤點，**production 早已有同名 `StoreSubscription` 等一整套方案/訂閱/升級系統並在 live 使用**。
> 因此本案改為「**擴充既有 `StoreSubscription`**」，所有規劃名稱一律對齊既有欄位（見 §0.5）。
> 後續 #294+ 一律以 v2 為準，**不得新建同名 model**。

---

## 0. 背景

目前「成長方案中心」（`/dashboard/settings/plans`）已完成，但它仍是**靜態展示頁**——方案、價格、續約日都是寫死的假資料。

實務上每家店的：
- 使用方案
- 起始日 / 到期日
- 付款方式 / 付款狀態
- 訂閱狀態

都不一樣，且會隨時間變動。若每次調整都要改 Code、重新 deploy，無法規模化。

因此需要先規劃「**店家訂閱管理**」，讓 OWNER / ADMIN 能直接在後台維護每家店的訂閱資料，「成長方案中心」未來再改為讀取真實訂閱資料。

---

## 0.5 既有系統盤點與修訂決策（v2 新增）

### 盤點結論：production 已有完整方案/訂閱系統

以下物件**早在 `prisma/migrations/0_baseline`、已部署 production、且程式 live 使用**，本案不可無視：

| 既有物件 | 角色 | 使用處 |
|---|---|---|
| `Store.plan : PricingPlan` + `planStatus / planEffectiveAt / planExpiresAt / currentSubscriptionId` | **目前方案的真正來源**（`getCurrentStorePlan()` 讀這欄） | `/dashboard/settings/plan`、各處 feature gate |
| `model StoreSubscription` | 方案的**計費生命週期紀錄** | `src/server/actions/upgrade-request.ts`（8+ 處 create/update）、`queries/upgrade-request.ts` |
| `model StorePlanChange` | 方案**異動軌跡**（= 規劃中的 SubscriptionHistory 雛形） | upgrade-request、plan-overview |
| `model UpgradeRequest` | 升級 / 付款**申請流程** | `/dashboard/upgrade-requests` |
| enum `PricingPlan` `EXPERIENCE/BASIC/GROWTH/ALLIANCE` | 方案分級 | 全系統 |
| enum `SubscriptionStatus` `TRIAL/ACTIVE/PAYMENT_PENDING/PAST_DUE/CANCELLED/EXPIRED` | 訂閱狀態 | StoreSubscription |
| enum `BillingStatus` `NOT_REQUIRED/PENDING/PAID/FAILED/REFUNDED/WAIVED` | 付款狀態 | StoreSubscription / UpgradeRequest |

### 決策

1. **不新建 model**，改為**擴充既有 `StoreSubscription`**（最安全、符合現況）。
2. **欄位一律對齊既有名稱**（不改名，避免打到 live 金流流程）。下表為規劃名 → 既有欄位對照（**這張表是本文件其餘章節的權威對照**）：

   | v1 規劃名 | 既有欄位 | 處置 |
   |---|---|---|
   | `planType` | `plan : PricingPlan` | 沿用既有（見 §3 mapping） |
   | `billingCycle` | `billingCycle : String?`（`MONTHLY/YEARLY/ONE_TIME`） | 沿用既有（先不轉 enum） |
   | `startDate` | `startedAt` / `effectiveAt` | 沿用既有 |
   | `endDate` | `expiresAt` | 沿用既有 |
   | `status` | `status : SubscriptionStatus` | 沿用既有（見 §5） |
   | `paymentStatus` | `billingStatus : BillingStatus` | 沿用既有（見 §6） |
   | `amountPaid` | `priceAmount : Int?`（+ `priceCurrency`） | 沿用既有 |
   | `notes` | `note : String?` | 沿用既有 |
   | `createdBy` | `createdBy : String?` | **已存在** |
   | history | `StorePlanChange` | 沿用既有 |
   | `paymentMethod` | — | **本案唯一需新增的「資料」欄位** |
   | `updatedBy` | — | **本案唯一需新增的「追蹤」欄位** |

3. **enum 決策（已拍板）**：
   - `paymentStatus` **沿用既有 `BillingStatus`**（6 值比規劃的 4 值更完整），**不新增 4 值 enum**。
   - **不新增 `EXPIRING` / `SUSPENDED`**：`EXPIRING` 用 `expiresAt ≤ 30 天` **計算**得出、不落 DB；`SUSPENDED` 停權機制尚未要做，先不讓 enum 提早膨脹。

### #294 最小改動（additive only）

- 新增 enum `SubscriptionPaymentMethod { CASH, BANK_TRANSFER, CREDIT_CARD }`
- 既有 `StoreSubscription` 新增：`paymentMethod SubscriptionPaymentMethod?`、`updatedBy String?`
- （視需要）補索引：`@@index([expiresAt])`、`@@index([billingStatus])`
- migration 全為 additive（CREATE TYPE + ALTER TABLE ADD COLUMN [+ CREATE INDEX]），**不碰既有資料、不碰 upgrade-request**。

---

## 1. 核心目標

讓 OWNER / ADMIN 未來可以管理每家店的：

- 使用方案（基礎 / 專業 / 展店）
- 月繳 / 年繳
- 起始日
- 到期日
- 付款方式
- 付款狀態
- 訂閱狀態
- 備註

並提供到期提醒，避免門市方案到期卻無人知道。

---

## 2. 資料模型（擴充既有 `StoreSubscription`）

> **權威對照在 §0.5**。本節描述既有 model 與本案的 additive 擴充；規劃名 → 既有欄位請以 §0.5 對照表為準。

### 既有 `StoreSubscription`（節錄現況，不改動）

```
model StoreSubscription {
  id              String             @id @default(cuid())
  storeId         String
  plan            PricingPlan                      // = 規劃 planType
  status          SubscriptionStatus @default(ACTIVE)
  startedAt       DateTime           @default(now())// = 規劃 startDate
  effectiveAt     DateTime?
  expiresAt       DateTime?                         // = 規劃 endDate（最後可用日）
  cancelledAt     DateTime?
  isTrial         Boolean            @default(false)
  billingCycle    String?            // MONTHLY | YEARLY | ONE_TIME
  billingStatus   BillingStatus      @default(NOT_REQUIRED) // = 規劃 paymentStatus
  priceAmount     Int?                              // = 規劃 amountPaid
  priceCurrency   String?            @default("TWD")
  sourceRequestId String?
  createdBy       String?                           // 已存在
  note            String?                           // = 規劃 notes
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  store           Store              @relation("StoreSubscriptions", ...)
  currentForStore Store?             @relation("CurrentSubscription")
  planChanges     StorePlanChange[]                 // 異動軌跡（= 規劃 history）
  @@index([storeId]) @@index([status])
}
```

### 本案 additive 擴充（#294 唯一要做的 schema 變更）

| 動作 | 內容 | 風險 |
|---|---|---|
| 新增 enum | `SubscriptionPaymentMethod { CASH, BANK_TRANSFER, CREDIT_CARD }` | 低（全新型別） |
| 新增欄位 | `paymentMethod SubscriptionPaymentMethod?` | 低（nullable additive） |
| 新增欄位 | `updatedBy String?`（操作者追蹤；`createdBy` 已有） | 低（nullable additive） |
| 補索引（可選） | `@@index([expiresAt])`、`@@index([billingStatus])` | 低 |

> **不做**：改既有欄位名（`expiresAt→endDate` 等）、改 `PricingPlan` / `SubscriptionStatus` enum 值、動 `upgrade-request` 流程。這些會連鎖打到 live 金流，**絕不在 #294 範圍**。

### 關聯（既有，不改）
- 一家 `Store` 對多筆 `StoreSubscription`（保留歷史）；`Store.currentSubscriptionId` 指向「目前訂閱」。
- **不要加 `@@unique([storeId])`**：會卡死續約與歷史多筆（既有設計本就允許多筆，維持）。

> **操作者追蹤（actor tracking）**：訂閱資料未來會由不同人（店長、ADMIN）修改，出問題時必須查得到「誰、何時改了什麼」。
> `createdBy` 既有、`updatedBy` 本案新增為 nullable；寫入邏輯於 PR #295 隨管理頁落地；逐筆變更軌跡由既有 `StorePlanChange`（§9）承接。

---

## 3. 方案定義（對齊既有 `PricingPlan`）

成長方案中心三方案**不新增 enum**，直接對應既有 `PricingPlan`：

| 成長方案中心顯示 | 既有 `PricingPlan` | 定位 |
|---|---|---|
| 基礎版 | `BASIC` | 管理一家店 |
| 專業版 | `GROWTH` | 經營顧客 |
| 展店版 | `ALLIANCE` | 複製成功門市 |
| （體驗版） | `EXPERIENCE` | 試用層，位於基礎版之下 |

> `feature-flags.ts` 已明寫 `GROWTH / PRO（專業版）`，故 v1 規劃的 `PRO` = 既有 `GROWTH`、`EXPANSION` = 既有 `ALLIANCE`。
> **mapping（顯示名 ↔ PricingPlan）需集中在單一處**（如 `feature-flags.ts` 的 `PRICING_PLAN_INFO`），避免命名漂移散落各檔。

---

## 4. 週期規則

### 月繳（`MONTHLY`）
- 使用期間：起始日 + 1 個月
- `endDate = startDate + 1 個月 − 1 天`

### 年繳（`YEARLY`）
- 買 12 個月，**加贈 2 個月**
- 共 **14 個月**使用
- `endDate = startDate + 14 個月 − 1 天`

### 到期日定義（重要）
- 到期日為「**最後一天仍可使用**」。本節的 `endDate` / `startDate` 即既有 `expiresAt` / `startedAt`（見 §0.5）。
- 通式：`expiresAt = startedAt + cycleMonths − 1 天`，其中 `cycleMonths` = 月繳 1 / 年繳 14。

### 範例
| 起始日 | 週期 | 使用月數 | 到期日（最後可用日） |
|---|---|---|---|
| 2026/07/01 | 月繳 | 1 | 2026/07/31 |
| 2026/07/01 | 年繳 | 14 | **2027/08/31** |

> 計算需走系統共用日期工具（`src/lib/date-utils.ts`，UTC+8），不可各自手算時區或用 `new Date().toISOString().slice(0,10)` 判斷營業日。月份相加遇月底（如 1/31 + 1 月）的進位規則，實作時需明確定義並加測試。

---

## 5. 訂閱狀態（沿用既有 `SubscriptionStatus`，不新增 enum 值）

既有 enum 已足夠第一階段使用，**不新增 `EXPIRING` / `SUSPENDED`**：

| 既有狀態 | 意義 |
|---|---|
| `TRIAL` | 試用中 |
| `ACTIVE` | 正常使用 |
| `PAYMENT_PENDING` | 待付款 |
| `PAST_DUE` | 逾期（付款層面） |
| `CANCELLED` | 已取消 |
| `EXPIRED` | 已到期 |

### 「即將到期 / 停權」怎麼處理（決策已拍板）
- **`EXPIRING` 不落 DB**：用 `expiresAt ≤ 今天 + 30 天` **即時計算**得出（純衍生狀態，UI / 提醒層算）。
- **`SUSPENDED` 暫不加**：停權機制第一階段不做，先不讓 enum 提早膨脹；未來真要做停權時再評估新增。

### 第一階段重要原則（不變）
- **已到期（`EXPIRED`）≠ 停權**。
- **第一階段不自動停權、不自動改 status**，避免方案到期就中斷門市營運。
- 「即將到期」僅為衍生顯示，不改變既有 status 機器邏輯（仍由 upgrade-request 流程主導）。

---

## 6. 付款狀態（沿用既有 `BillingStatus`，不新增 enum）

**不新增 4 值 enum**，沿用既有 `BillingStatus`（6 值更完整）。對照 v1 規劃：

| 既有 `BillingStatus` | 意義 | 對應 v1 規劃 |
|---|---|---|
| `NOT_REQUIRED` | 不需付款 | —（規劃未涵蓋） |
| `PENDING` | 尚未付款 | `UNPAID` |
| `PAID` | 已付款 | `PAID` |
| `FAILED` | 付款失敗 | —（規劃未涵蓋） |
| `REFUNDED` | 已退款 | —（規劃未涵蓋） |
| `WAIVED` | 特殊免收（創始店 / 內部店 / 測試店） | `WAIVED` |

> 規劃的 `OVERDUE`（逾期未付）可用 `billingStatus=PENDING` 且 `expiresAt < 今天` 衍生判斷，**不必新增 enum 值**。
> `WAIVED` 與訂閱狀態獨立：免收的店仍可正常使用。

---

## 7. 到期提醒規則

| 時機 | 顯示訊息（示意） |
|---|---|
| 到期前 30 天 | 方案將於 30 天內到期 |
| 到期前 7 天 | 方案即將到期 |
| 到期後 | 方案已到期 |

### 原則
- **第一階段只提醒，不自動停權、不自動續約。**
- 提醒對象：OWNER / ADMIN（後台顯示；是否走既有 daily 18:00 提醒批次，於實作階段再評估，先以後台頁面內提醒為主）。
- 提醒僅為資訊揭露，不改變 `status` 自動行為（仍維持 §5 原則）。

---

## 8. OWNER / ADMIN 管理頁規劃

- **頁面名稱**：店家訂閱管理
- **位置建議**：設定 > 店家訂閱管理（`/dashboard/settings/subscriptions`，實作階段確認）
- **權限**：OWNER / ADMIN；server action 需 `requirePermission()` 後端檢查（不可只靠 UI）

### 列表欄位
- 店家
- 方案
- 付款週期
- 起始日
- 到期日
- 訂閱狀態
- 付款方式
- 付款狀態
- 金額

### 編輯欄位
- 方案
- 月繳 / 年繳
- 起始日
- 到期日（可由起始日 + 週期自動帶出，允許手動覆寫）
- 付款方式（`paymentMethod`）
- 付款狀態（`billingStatus`）
- 備註（`note`）

> 「手動停權」第一階段不做（`SUSPENDED` 已決定暫不加，見 §5）；待停權機制立案再補。

---

## 9. 訂閱歷史紀錄（沿用既有 `StorePlanChange`）

**不新建 `SubscriptionHistory`** — 既有 `StorePlanChange` 已是訂閱異動軌跡，且 enum `PlanChangeType` 已涵蓋多數事件：
`TRIAL_STARTED / UPGRADE_APPROVED / DOWNGRADE_SCHEDULED / DOWNGRADE_EXECUTED / PLAN_ACTIVATED / PLAN_RENEWED / PLAN_CANCELLED / ADMIN_MANUAL_CHANGE / PAYMENT_CONFIRMED / PAYMENT_FAILED`。

每筆 `StorePlanChange` 已記 `fromPlan/toPlan`、`fromStatus/toStatus`、`subscriptionId`、`operatorUserId`、`reason`、`metadataJson`。

> 第一階段不動 `StorePlanChange`。未來若 #295 管理頁的手動編輯需要留痕，再評估補對應 `PlanChangeType` 值或沿用 `ADMIN_MANUAL_CHANGE`。對照規劃事件（開通/續約/升級/降級/延長/付款）多已可映射既有值。

---

## 10. 第一階段刻意不做（Out of scope）

明確列出本訂閱 initiative 早期**不做**的項目：

- ❌ 不接 Stripe
- ❌ 不接 TapPay
- ❌ 不做自動扣款
- ❌ 不做自動續約
- ❌ 不做自動停權（且暫不加 `SUSPENDED`）
- ❌ 不做方案權限鎖定
- ❌ **不新建 model、不改既有欄位名、不改既有 enum 值**（#294 僅 additive 擴充：新增 `paymentMethod` / `updatedBy` / 可選索引）
- ❌ 不做 UI 實作
- ❌ 不改既有功能流程（尤其不碰 `upgrade-request`）

> 註：#294 會做**一支純 additive migration**（這不在「不做」清單；早期「不做 migration」的舊敘述已隨 v2 修訂作廢）。
> **本（修訂）PR 僅修改本規劃文件**，零程式 / 零 schema / 零 migration / 零路由變更。

---

## 11. 後續 Roadmap（建議拆分）

| PR | 範圍 | 重點 |
|---|---|---|
| **#294** | **擴充既有 `StoreSubscription`**（非新建） | additive：新增 `paymentMethod` enum+欄位、`updatedBy`、可選索引；先不接金流（見 §0.5 / §2） |
| **#295** | 店家訂閱管理頁 | 列表 + 編輯（§8）；`EXPIRING`/`OVERDUE` 由日期衍生；寫入 `createdBy`/`updatedBy` |
| **#296** | 訂閱歷史 | 沿用 / 擴充既有 `StorePlanChange`（§9），非新建 SubscriptionHistory |
| **#297** | Stripe 自動扣款 | 金流串接、自動續約 |
| **#298** | 方案權限鎖定 | 依 `PricingPlan` 控制功能可見性 |

> 每支 PR 都應遵守專案鐵律：migration 先於 deploy、財務主線一次只動一條、增量 PR 勝過硬合。

---

## 驗收標準（本修訂 PR）

- ✅ 只修改 `docs/store-subscription-planning.md`（v1 → v2 對齊既有 production 系統）
- ✅ 不改 schema / 不建 migration
- ✅ 不改任何程式功能
- ✅ 不改路由 / 不影響任何頁面
- ✅ 修訂後文件可作為 #294「擴充既有 `StoreSubscription`」的依據
