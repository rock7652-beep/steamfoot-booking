# 店家訂閱管理規劃（Store Subscription Management）

> 狀態：**規劃文件（Planning only）**，本階段不實作任何功能。
> 用途：作為後續實作（schema / 管理頁 / 歷史紀錄 / 金流）的依據。

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

## 2. 建議資料模型

### `StoreSubscription`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string (cuid) | 主鍵 |
| `storeId` | string | 對應 `Store.id`，外鍵 |
| `planType` | enum `PlanType` | `BASIC` / `PRO` / `EXPANSION` |
| `billingCycle` | enum `BillingCycle` | `MONTHLY` / `YEARLY` |
| `startDate` | DateTime（date 部分為準） | 起始日 |
| `endDate` | DateTime（date 部分為準） | 到期日＝**最後一天仍可使用** |
| `status` | enum `SubscriptionStatus` | `ACTIVE` / `EXPIRING` / `EXPIRED` / `SUSPENDED` |
| `paymentMethod` | enum `PaymentMethod` | `CASH` / `BANK_TRANSFER` / `CREDIT_CARD` |
| `paymentStatus` | enum `PaymentStatus` | `PAID` / `UNPAID` / `OVERDUE` / `WAIVED` |
| `amountPaid` | Int（TWD，元） | 實際收款金額 |
| `notes` | string? | 備註（自由文字） |
| `createdAt` | DateTime | 建立時間 |
| `updatedAt` | DateTime | 更新時間 |

### 關聯
- 一家 `Store` 對多筆 `StoreSubscription`（保留歷史；同一時間以最新一筆為「目前訂閱」）。
- 第一階段可先簡化為「一店一筆目前訂閱」，但 schema 設計需預留多筆（為日後續約 / 升級保留歷史）。

### 索引建議
- `@@index([storeId])`
- `@@index([status])`（提醒批次掃描用）
- `@@index([endDate])`（到期排序用）

> 註：欄位 enum 命名與系統現有慣例對齊；`planType` 採 `BASIC / PRO / EXPANSION`，與「成長方案中心」展示用的三方案一一對應（見 §3）。

---

## 3. 方案定義

| `planType` | 顯示名稱 | 定位 |
|---|---|---|
| `BASIC` | 基礎版 | 管理一家店 |
| `PRO` | 專業版 | 經營顧客 |
| `EXPANSION` | 展店版 | 複製成功門市 |

> 對照提醒：現有 feature-flag / 成長方案中心使用「專業版」一詞，對應本訂閱模型的 `PRO`。實作時需做一層 mapping，避免命名漂移。

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
- 到期日（`endDate`）為「**最後一天仍可使用**」。
- 通式：`endDate = startDate + cycleMonths − 1 天`，其中 `cycleMonths` = 月繳 1 / 年繳 14。

### 範例
| 起始日 | 週期 | 使用月數 | 到期日（最後可用日） |
|---|---|---|---|
| 2026/07/01 | 月繳 | 1 | 2026/07/31 |
| 2026/07/01 | 年繳 | 14 | **2027/08/31** |

> 計算需走系統共用日期工具（`src/lib/date-utils.ts`，UTC+8），不可各自手算時區或用 `new Date().toISOString().slice(0,10)` 判斷營業日。月份相加遇月底（如 1/31 + 1 月）的進位規則，實作時需明確定義並加測試。

---

## 5. 訂閱狀態（`SubscriptionStatus`）

| 狀態 | 意義 | 判定 |
|---|---|---|
| `ACTIVE` | 正常使用 | 今天 ≤ endDate，且未手動停權 |
| `EXPIRING` | 即將到期 | endDate 在今天起 30 天內，且未到期 |
| `EXPIRED` | 已到期 | 今天 > endDate |
| `SUSPENDED` | 手動停權 | OWNER 手動設定 |

### 第一階段重要原則
- **已到期（EXPIRED）≠ 停權（SUSPENDED）**。
- **第一階段不自動停權**，避免方案到期就中斷門市營運。
- 是否停權**由 OWNER 手動決定**（`SUSPENDED` 只能手動進入）。
- `ACTIVE` / `EXPIRING` / `EXPIRED` 可由日期推導；`SUSPENDED` 為人為覆寫，優先於日期推導。

---

## 6. 付款狀態（`PaymentStatus`）

| 狀態 | 意義 |
|---|---|
| `PAID` | 已付款 |
| `UNPAID` | 尚未付款 |
| `OVERDUE` | 逾期未付款 |
| `WAIVED` | 特殊免收（例如創始店、內部店、測試店） |

> `WAIVED` 與訂閱狀態獨立：免收的店仍可為 `ACTIVE`。

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
- 付款方式
- 付款狀態
- 備註
- 是否手動停權（對應 `SUSPENDED`）

---

## 9. 訂閱歷史紀錄規劃（未來）

未來需要 `SubscriptionHistory`，用來記錄每一次訂閱事件：

- 開通（CREATE）
- 續約（RENEW）
- 升級（UPGRADE）
- 降級（DOWNGRADE）
- 延長（EXTEND）
- 停權（SUSPEND）
- 恢復使用（RESUME）
- 付款紀錄（PAYMENT）

> **第一階段可先不實作**，但 schema 與管理頁需預留擴充空間，並於本文件註明未來需要。日後實作時建議每筆 history 記錄 `before / after` 快照與操作者（actor）。

---

## 10. 第一階段刻意不做（Out of scope）

明確列出本初期階段**不做**的項目：

- ❌ 不接 Stripe
- ❌ 不接 TapPay
- ❌ 不做自動扣款
- ❌ 不做自動續約
- ❌ 不做自動停權
- ❌ 不做方案權限鎖定
- ❌ 不做 schema migration
- ❌ 不做 UI 實作
- ❌ 不改既有功能

> 本 PR 僅新增本規劃文件，零程式 / 零 schema / 零路由變更。

---

## 11. 後續 Roadmap（建議拆分）

| PR | 範圍 | 重點 |
|---|---|---|
| **#294** | `StoreSubscription` Schema | 新增 model + enum + migration；先不接金流 |
| **#295** | 店家訂閱管理頁 | 列表 + 編輯（§8）；狀態 / 提醒由日期推導 |
| **#296** | 訂閱歷史紀錄 | `SubscriptionHistory`（§9） |
| **#297** | Stripe 自動扣款 | 金流串接、自動續約 |
| **#298** | 方案權限鎖定 | 依 `planType` 控制功能可見性 |

> 每支 PR 都應遵守專案鐵律：migration 先於 deploy、財務主線一次只動一條、增量 PR 勝過硬合。

---

## 驗收標準（本 PR）

- ✅ 只新增 `docs/store-subscription-planning.md`
- ✅ 不改任何程式功能
- ✅ 不改 schema
- ✅ 不改路由
- ✅ 不影響任何頁面
- ✅ 文件可作為後續實作依據
