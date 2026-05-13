# 店長服務費結算 — Phase 1 規格（試算模組）

> Status: Draft / PR-1
> 範圍：純規格 + read-only 統計，**不改任何功能、不動 schema、不跑 migration**

---

## 1. 背景

目前系統有 `/dashboard/transactions`（交易紀錄）與 `/dashboard/reports`（店營收 / 教練營收），
兩者都已能依「店長」切分數字，但本質上是 **「交易金額歸屬」** 的視角：
顧客一次儲值多堂 → 交易完成當下，整筆金額即列為該店長的營收。

營運上發現一個風險：店長可能在顧客儲值後拿走整筆服務費，
但顧客剩下的堂數還沒服務完，店家仍要承擔後續服務責任。

**Phase 1 要做的事**：新增一個獨立的「店長服務費結算（試算）」模組，
改成「顧客**實際完成幾次服務**，就結算幾次服務費給店長」。

---

## 2. 邊界（這次絕對不會動的東西）

| 不會改 | 理由 |
|---|---|
| `/dashboard/transactions` 既有交易紀錄頁 | 是金流視角，不是結算視角，並行存在 |
| `/dashboard/reports` 既有報表 | 是營收視角（用 Transaction.revenueStaffId），並行存在 |
| `Transaction` 任何欄位、金額、`revenueStaffId` | 歷史資料不動 |
| `Booking` 任何欄位、`bookingStatus`、`revenueStaffId` 快照 | 歷史資料不動 |
| `CustomerPlanWallet.remainingSessions` | 不會因為新模組增減堂數 |
| `WalletSession` 狀態 | 不會新增/改動 session |
| 付款確認、退款、作廢、補登流程 | 完全不碰 |
| Prisma schema | 零新欄位、零 migration |

---

## 3. 結算規則 v1（依 2026-05-12 對話拍板）

### 3.1 一般服務 → 計入服務費

- 條件：`Booking.bookingStatus = "COMPLETED"` AND `Booking.isMakeup = false`
- 處理：每筆完成預約 = 一份「店長應結服務費」
- 歸屬：依 **`Booking.revenueStaffId` 快照**（不用顧客當下的 `assignedStaffId`，避免轉店長洗歷史）

### 3.2 補課 → 計入服務費，明細標示「補課」

- 條件：`Booking.bookingStatus = "COMPLETED"` AND `Booking.isMakeup = true`
- 定義（**目前系統內 isMakeup 唯一語意**）：當日臨時取消（NO_SHOW）後，
  經發補課流程產生 `MakeupCredit`，再用該 credit 重新安排的補回服務。
- 處理：與一般服務同等計入結算，但明細欄位額外標示「補課」分類。
- 已驗證 `isMakeup` 在現有程式碼中**唯一寫入點**為
  [src/server/actions/booking.ts](../src/server/actions/booking.ts)，
  且強制要求 `makeupCreditId`，因此可安全當分類標籤使用。

### 3.3 免費服務 → Phase 1 不處理

- **目前系統沒有任何欄位可代表「免費服務 / 補償 / 贈送」**
  （schema 無 `isComplimentary`、無 `bookingNature` enum、`BookingType` 也沒有 `FREE/GIFT`）
- Phase 1 不嘗試識別、不寫死任何 heuristic、不從 `notes` 或 `Transaction.note` 推斷
- 未來新增免費服務功能時，**禁止複用 `isMakeup`**
  - `isMakeup` 已與「NO_SHOW 補課」業務流程綁定
  - 混入會破壞既有 UI 標籤、「補課不扣堂」邏輯、與 `MakeupCredit` 模型
  - 建議路線：新增 `Booking.bookingNature` enum（`REGULAR / MAKEUP / COMPLIMENTARY / COMPENSATION`）
    或新增獨立 `isComplimentary` + `complimentaryReason` 欄位

### 3.4 服務歸屬規則

- 主鍵：`Booking.revenueStaffId`（建立預約當下的快照）
- `revenueStaffId = null` 的 COMPLETED booking：標示「歸店家」，**不產生店長應付款**
- **不做** `assignedStaffId` fallback —— 顧客後續轉店長不可改變歷史結算歸屬

#### 3.4.1 建立 booking 時快照規則（PR-1.5a 鎖定）

快照來源**只能**是 `customer.assignedStaffId`（operator 透過顧客 drawer 或
批次指派 UI 明確設定的直屬店長）。實作位於 helper
`snapshotRevenueStaffForBooking()`（[src/server/actions/booking-helpers.ts](../src/server/actions/booking-helpers.ts)），
booking 建立流程**只能**透過此 helper 寫入 `revenueStaffId`。

**禁止事項**（[src/__tests__/booking-revenue-staff-snapshot.test.ts](../src/__tests__/booking-revenue-staff-snapshot.test.ts)
以 source-level guard 強制執行）：

1. **不可** import 或呼叫 `resolveCustomerStaffAssignment`。
   - 該 helper 的 4 層 fallback 含 store_owner，會把沒指派的顧客自動歸給
     owner，**繞過 operator 的批次指派 UI**，等於 silent assignment。
2. **不可**在 booking 建立流程中 update / upsert `Customer.assignedStaffId`。
   - booking 是「快照」，不該影響被快照的顧客資料。
   - 對應到 resolver 的 `persist: true` 副作用，本流程禁用。
3. **不可**寫死 inline fallback（例如 `customer.assignedStaffId ?? someOwnerId`）。
   - source guard 會檢查所有寫入都透過 helper。

**`null` 是合法的快照值**：

- 若顧客沒有 `assignedStaffId` → `revenueStaffId = null` → 該筆 booking
  將被結算歸屬為「店家」。
- 不假裝補一位店長讓結算數字漂亮。
- 若 prod 上發現大量 null，正解是用 drawer / 批次指派 UI 補齊（PR #122），
  或對歷史 booking 走 PR-1.5b backfill dry-run，由 operator review 後寫入。

### 3.5 服務費單價（已停用，由 §3.7 取代）

> ⚠️ **deprecated 2026-05-13**（原 PR-2 設計）：用「頁面 input 單一服務費 × 完成次數」試算，
> 不符實際營運（不是分潤 / 抽成）。PR-2.2 改用 §3.7 攤提公式。

### 3.6 multi-store

- 一律 store-scoped，沿用 `getManagerReadFilter()`
- 店長角色只能看自己；OWNER / ADMIN 看全店
- 不跨店讀取

### 3.7 服務金額計算規則（方案攤提，2026-05-13 PR-2.2 上線）

#### 3.7.1 公式

```
方案單堂金額 = 顧客方案實收金額 ÷ 總可使用堂數

店長當月服務金額 = Σ (該店長為 revenueStaffId 的每筆 completed booking 對應方案單堂金額)
```

**範例**：「20 堂 + 贈送 2 堂、實收 12,000」

| 變數 | 值 |
|---|---|
| 顧客方案實收金額 | 12,000 |
| 總可使用堂數 | **22**（20 + 2 贈送） |
| 方案單堂金額 | 12,000 ÷ 22 = **545.45** |

該顧客 5 月完成 3 次服務 → 該月歸屬該店長 = 545.45 × 3 = 1,636.35。

**這不是分潤 / 抽成比例。** 是「方案收入按可用堂數攤提」。

#### 3.7.2 資料來源

| 欄位 | 來源 |
|---|---|
| 方案實收金額 | `CustomerPlanWallet.purchasedPrice`（Decimal(10, 0) 快照） |
| 總可使用堂數 | `CustomerPlanWallet.totalSessions` |
| Booking 對應 wallet | `Booking.customerPlanWalletId`，補課透過 `Booking.makeupCreditId → MakeupCredit.originalBookingId → 原 booking.customerPlanWalletId` 溯源 |
| 歸屬店長 | `Booking.revenueStaffId`（PR-1.5a 鎖定的快照） |

#### 3.7.3 schema 已知限制：`totalSessions` 可能不含贈送

`CustomerPlanWallet` **沒有獨立 `bonusSessions` 欄位**，只有 `totalSessions`。所以贈送堂歸入 `totalSessions` 與否，取決於 operator 當時建方案 / 加贈的方式：

- **A 寫法**（公式正確）：贈送直接寫進 `ServicePlan.sessionCount`（22 = 20+2）→ wallet.totalSessions=22 → 12000/22=545.45 ✓
- **B 寫法**（公式失準）：先設 sessionCount=20，購買後用 `adjustRemainingSessions` 加 2 堂（只動 remainingSessions，**不動** totalSessions）→ 12000/20=600 ❌

PR-1 audit 顯示 prod 過去 6 個月 83 筆 ADJUSTMENT 全 amount=0（月均 13.8）— B 寫法可能正在發生。

#### 3.7.4 Operator override 機制

針對 risk wallet（有 ADJUSTMENT 紀錄者），operator 必須人工確認真實單堂金額。流程：

1. 執行 [scripts/plan-amortization-wallet-review.ts](../scripts/plan-amortization-wallet-review.ts)（read-only）→ CSV
2. Operator 在 Excel / Sheets 填四欄：`suggestedCorrectTotalSessions` / `suggestedUnitPrice` / `reviewNote` / `operatorDecision`
3. 執行 [scripts/csv-to-settlement-overrides.ts](../scripts/csv-to-settlement-overrides.ts)（離線轉換）→ JSON
4. 提 PR 更新 [data/settlement-wallet-overrides.json](../data/settlement-wallet-overrides.json)
5. /dashboard/settlements 自動 pick up

`operatorDecision` 三種值對應的計算規則：

| Decision | UI 顯示 | 金額來源 |
|---|---|---|
| `OVERRIDE_TOTAL` | 用人工指定的 unit price | `override.overrideUnitPrice` |
| `CONFIRM_AS_IS` | 用公式計算 | `wallet.purchasedPrice ÷ wallet.totalSessions` |
| `EXCLUDE_FROM_SETTLEMENT` | 「需人工確認」、金額空白 | `null` |

#### 3.7.5 計算決策樹（implementation 參考）

對每筆 COMPLETED booking：

```
walletId = booking.customerPlanWalletId
         ?? booking.makeupCredit.originalBooking.customerPlanWalletId

若 walletId = null：
  FIRST_TRIAL  → amount=0, source="trial_no_wallet"
  SINGLE       → amount=0, source="single_no_wallet"
  PACKAGE      → amount=null, source="missing_wallet", needsReview=true

若 walletId 有值：
  override = getOverrideForWallet(walletId)
  
  override?.decision === "EXCLUDE_FROM_SETTLEMENT"
    → amount=null, source="operator_excluded", needsReview=true
  
  override?.decision === "OVERRIDE_TOTAL"
    → amount = override.overrideUnitPrice, source="override"
  
  override?.decision === "CONFIRM_AS_IS"
    → 若 wallet.purchasedPrice > 0 AND wallet.totalSessions > 0:
        amount = wallet.purchasedPrice / wallet.totalSessions, source="formula_confirmed"
      否則:
        amount=null, source="confirmed_but_data_missing", needsReview=true
  
  override === null（沒被 operator review）:
    若 wallet 有 ADJUSTMENT transaction:
      → amount=null, source="needs_operator_review", needsReview=true
        （**保守預設**：未經 review 的 risk wallet 不硬算）
    否則:
      → 若 wallet.purchasedPrice > 0 AND wallet.totalSessions > 0:
          amount = wallet.purchasedPrice / wallet.totalSessions, source="formula_clean"
        否則:
          amount=null, source="data_missing", needsReview=true
```

#### 3.7.6 PII / 安全邊界

- JSON 內**只**放 `walletId / decision / overrideTotalSessions / overrideUnitPrice`
- **不**放 customerName / reviewNote / 電話 / email 等 PII
- 原始填寫的 CSV 是營運資料，**不 commit 進 repo**
- JSON 載入失敗或 schema 不通 → server boot 直接 throw（不沉默 fallback）

#### 3.7.7 頁面命名

「店長服務費試算」（PR-2）→ **「店長服務金額試算」**（PR-2.2）。
避免「分潤 / 抽成 / 固定費率」語意誤解。

#### 3.7.8 Phase 2 schema 改造（不在 PR-2.x 範圍）

- 加 `CustomerPlanWallet.bonusSessions Int @default(0)`（從 totalSessions 拆出）
- 加 `CustomerPlanWallet.unitPriceAtPurchase Decimal(10, 2)` snapshot
- 修 `assignPlanToCustomer` 寫入這些欄位
- 舊資料 backfill 用 wallet override JSON 為真實值
- ADJUSTMENT 加 `reason` enum 區分（贈送 / 折抵 / 補登）
- 加 `SettlementWalletOverride` 表（讓 operator 在 UI 改 override，取代 JSON）

#### 3.7.9 制度面 follow-up：紙本舊客補登流程

**問題情境**：2026-05-13 prod 驗收時發現有顧客 wallet
`cmotrsp2b0001kv04snvpx1y2` 的 `purchasedPrice = 0`。原因不是免費方案，而是
「舊客紙本資料補登 — 實收 12,000 已在系統外收過，操作者補登 wallet 時沒再次
鍵入金額」。當下用 OVERRIDE_TOTAL 修正（22 堂 / 545.45），但這條漏洞不該靠
人工 override 永久處理。

**建議 Phase 2 加補登 UI**（系統允許 wallet 建立時明確標示「舊客補登」）：

```
[ 紙本舊客補登 ]
顧客方案：________________
已收金額：________________   ← 必填（與 purchasedPrice 寫入相同）
總堂數：__________________   ← 含贈送堂
起始剩餘堂數：____________   ← 顧客目前還剩幾堂可用
備註：___________________   ← 自由文字，例：「2024-12 紙本，現金已收」
```

這條 UI 走 `assignPlanToCustomer` 但走「補登模式」分支：

- 不產生 PACKAGE_PURCHASE Transaction（因為錢已收過）
- 仍寫入 `wallet.purchasedPrice = 已收金額` + `totalSessions = 總堂數`
- `remainingSessions = 起始剩餘`
- Note / audit log 標示來源為「紙本補登」

這樣未來 audit 不會把 purchasedPrice=0 誤判為「免費方案」，operator 也不用
再開 settlement override PR 補救。

---

## 4. Phase 1 不做的事

- ❌ 不產生正式結算單（StaffSettlement 表暫不存在）
- ❌ 不新增付款狀態 enum
- ❌ 不鎖定月份
- ❌ 不更新 Booking / WalletSession / CustomerPlanWallet / Transaction 任何欄位
- ❌ 不改 reports 的營收數字
- ❌ 不改 transactions 的列表邏輯
- ❌ 不處理「免費服務」分類
- ❌ 不依 BookingType 差異化（試用 / 單堂 / 套餐都用同一單價試算）
- ❌ 不乘 `people` 人數（多人預約 Phase 1 一律算 1 次服務費，與 isMakeup 一樣只當分類欄位）

---

## 5. Known Limitations（Phase 1 已知無法解決）

### 5.1 `adjustRemainingSessions` 贈送漏洞

- 店長可透過 [`adjustRemainingSessions()`](../src/server/actions/wallet.ts) 無痕加減顧客堂數，
  產生 amount=0 的 `ADJUSTMENT` Transaction，`note` 自由填寫。
- 這條路徑加出來的堂數在 Booking 視角看不出來源，
  該堂數預約完成後，Phase 1 仍會視為一般服務並計入店長服務費。
- **Phase 1 不嘗試從 note 推斷**（任何 heuristic 都會誤判）。
- 修復方案：等「免費服務」正式欄位上線（Phase 2+）。
- **實際數據**（2026-05-12 prod audit）：過去 6 個月 83 筆 ADJUSTMENT
  **全部 amount=0**，月均約 13.8 筆。此漏洞為高頻使用，
  Phase 2 的免費服務正式欄位優先級為「必做」。詳見 §8.2。

### 5.2 服務費單價無業務規則

- Phase 1 僅支援單一全域單價，無法區分「不同方案不同抽成」「主服務 / 協助服務拆分」。
- 也不支援體驗 / 補課是否該用不同單價（補課與一般同價）。

### 5.3 不支援多店長協作

- 若一場服務有主店長 + 協助店長，Phase 1 只計給 `revenueStaffId`。
- `Booking.serviceStaffId`（當日值班）Phase 1 僅顯示，不參與分配。

---

## 6. UI Phase 1 規劃（PR-3 才會做）

路徑：`/dashboard/settlements`
頁面標題：「店長服務費試算」（**標題明確含「試算」二字，與正式結算單區隔**）

### 6.1 篩選列

- 日期區間（預設本月，可自訂）
- 店長（全部 / 單一 / 未指派）
- 單次服務費單價（input，預設由使用者填）

### 6.2 統計摘要

- 區間內完成服務總次數
- 可結算店長數
- 歸店家服務次數（`revenueStaffId = null`）
- 各店長應結金額

### 6.3 店長彙總表

| 店長 | 完成次數 | 一般服務 | 補課 | 單次服務費 | 應結金額 |

### 6.4 完成服務明細表

| 服務日期 | 時段 | 顧客 | 直屬店長 | 服務歸屬（revenueStaffId） | 實際服務（serviceStaffId） | 方案 | 分類（一般/補課） | 應結金額 |

### 6.5 匯出

- 跟隨既有 `/api/reports/export` 慣例使用 **xlsx**（exceljs 已是 dependency），
  不另開 CSV 通道避免兩種匯出格式並存。

---

## 7. PR 切法

| PR | 內容 | 是否動 schema | 是否動 UI |
|---|---|---|---|
| PR-1 ✅ | 規格文件 + read-only 統計腳本（已 merge #120） | ❌ | ❌ |
| 顧客指派側鏈 ✅ | 單筆 + 批次指派 + UI hotfix（#121 / #122 / #123 / #124）| ❌ | 部分 |
| PR-1.5 ✅ | 重新 audit assignment / booking 快照狀態（本 PR / #125）| ❌ | ❌ |
| PR-1.5a ✅ | future-only fix：booking 建立寫入 revenueStaffId 快照（#126，**禁止** resolver fallback / customer 副作用，已鎖 source guard） | ❌ | ❌ |
| PR-1.5b ✅ | 歷史 backfill **dry-run** 腳本（#127） | ❌ | ❌ |
| PR-1.5c | 歷史 backfill 真實寫入腳本（default dry-run；ops-only，不一定合進 main） | ❌ | ❌ |
| PR-2 ✅ | 試算頁初版（fee × count，#129） | ❌ | ✅ |
| 警示 banner ✅ | mini-PR：在 PR-2 頁面加紅色 banner（#130） | ❌ | ✅ |
| PR-2.1a ✅ | wallet-level sanity check（#131） | ❌ | ❌ |
| PR-2.1b ✅ | operator review CSV worksheet（#132） | ❌ | ❌ |
| **PR-2.2 ✅（本支）** | 攤提金額版：移除 fee input；用 wallet override JSON；頁面改名「店長服務金額試算」；NEEDS_REVIEW UI | ❌ | ✅ |
| PR-3 | `/api/settlements/export` xlsx 匯出 | ❌ | ✅ |
| PR-4（Phase 2）| `CustomerPlanWallet.bonusSessions` + `unitPriceAtPurchase` schema + `SettlementWalletOverride` table + 正式結算 / 付款 / 鎖帳 + 獨立 `settlement.*` 權限 | ✅ | ✅ |

> **PR-2 動工前狀態**：PR-1.5a 已鎖死 booking 建立的快照規則，PR-1.5b 已產出
> backfill dry-run 工具。本 PR 僅做「試算」UI，**不**做正式結算單 / 付款 / 鎖帳。
> 服務費單價由前端 input 即時計算，不入庫。
>
> **PR-2 不引入 `resolveCustomerStaffAssignment`**：與 PR-1.5a 的 source guard 一致，
> 試算 query 也只讀 booking 的 `revenueStaffId` 快照，不對顧客 / 預約資料做任何
> 寫回 fallback。

---

## 8. Audit 統計結果（待跑 `scripts/staff-settlement-audit.ts` 後回填）

執行方式（請使用者親自在有 prod 連線的環境執行）：

```bash
# 預設：過去 6 個月
npx tsx scripts/staff-settlement-audit.ts

# 自訂區間
npx tsx scripts/staff-settlement-audit.ts --from 2025-11-12 --to 2026-05-12

# 指定單店（多店環境下推薦）
npx tsx scripts/staff-settlement-audit.ts --store <storeId>

# 輸出 CSV
npx tsx scripts/staff-settlement-audit.ts --csv > audit.csv
```

### 8.1 Audit 執行結果（2026-05-12 prod read-only audit）

```
區間：2025-11-13 ~ 2026-05-12（過去 6 個月）
店家範圍：ALL（prod 目前僅竹北 1 店）

【Booking 完成服務統計】
- COMPLETED booking 總筆數              : 23
- 其中 isMakeup = true（補課）          : 0
- 其中 isMakeup = false（一般）         : 23
- 其中 revenueStaffId = null（歸店家）  : 23   ← 100.0% 🔴
- 其中 people > 1（多人預約）           : 0

【BookingType 分布】
- FIRST_TRIAL                           : 1
- SINGLE                                : 7
- PACKAGE_SESSION                       : 15

【ADJUSTMENT 交易（贈送漏洞觀察）】
- ADJUSTMENT 總筆數                     : 83
- ADJUSTMENT 且 amount = 0              : 83   ← 100% 全部是 amount=0
- ADJUSTMENT 且 amount ≠ 0              : 0
- 月均                                  : ~13.8 筆 🔴

【店長覆蓋率】
- 不同 revenueStaffId 數                : 0
- 完成服務分布最高的店長佔比             : N/A（無任何 booking 有 revenueStaffId）
```

### 8.2 Sanity check 結論

#### 🔴 重大決策點：revenueStaffId 100% 為 null —— **PR-2 動工前必須解決**

prod 過去 6 個月 23 筆 COMPLETED booking **全部** `revenueStaffId = null`。
若 Phase 1 嚴格依 §3.4 規則「只用 `Booking.revenueStaffId` 當歸屬」，
畫面會顯示**所有完成服務都歸店家、零店長可結算**，整個結算試算模組失去意義。

可能成因（**尚未調查**，下一個 task 才會盤點）：
- 舊資料：早期 Booking 建立流程沒有把 `Customer.assignedStaffId` 寫入 `revenueStaffId` 快照。
- 現行流程：目前的 booking 建立 server action 是否仍漏寫此快照？
- 業務性質：竹北店目前是否實際上每筆 booking 建立時顧客都還沒指派直屬店長？

待決策（**任一選項都需業主拍板，PR-2 不可在此之前進行**）：
- 選項 A：放寬 §3.4，允許 fallback 到 `Customer.assignedStaffId @ 完成服務當下`
  - 風險：違反「歷史不被顧客轉店長洗掉」原則
- 選項 B：先做一次性 `revenueStaffId` 歷史 backfill，再進 PR-2
  - 風險：需要動 Booking 既有資料，違反目前 PR-1 邊界
- 選項 C：先修現行 booking 建立流程確保未來新資料都有 `revenueStaffId`，
  歷史資料維持 null（短期模組對舊資料無用，但隨時間自然好轉）
- 選項 D：放棄 Phase 1 結算試算模組，直接跳 Phase 2 連同 schema 一起設計

**Phase 1 在此決策做出前不進 PR-2。** §7 PR 路線圖中 PR-2 已標記為 🔴 blocked。

#### 🔴 重大發現：amount=0 ADJUSTMENT 月均 13.8 筆 —— 贈送漏洞高頻使用

prod 過去 6 個月 83 筆 ADJUSTMENT 交易**全部 amount=0**，月均約 13.8 筆，
遠高於原預設 5 筆閾值。代表「免費服務 / 贈送堂數」繞路
（[`adjustRemainingSessions()`](../src/server/actions/wallet.ts)）正在被高頻使用。

影響：
- Phase 1 仍然無法區分這些堂數（無正式欄位），完成預約後會被計入店長服務費。
- Phase 2 的「免費服務」正式欄位（§3.3 建議的 `bookingNature` enum 或
  `isComplimentary` + reason）**優先級需從「待辦」提升為「必做」**。

#### ✓ 補課比例 0%（合理）

prod 過去 6 個月無補課 booking，與「補課僅由 NO_SHOW 補課流程觸發」的設計相符。
`isMakeup` 當分類標籤的安全性已驗證。

#### 補充觀察：資料量小

23 筆 / 6 個月 ≈ 月均 4 筆完成服務。這是竹北店實際 prod 數字。
Phase 1 模組設計應考慮「小資料量友善」的展示（例如就算只有幾筆也要看得清）。

### 8.3 PR-1.5 重新 audit 結果（2026-05-12，顧客指派側鏈完工後）

執行：[scripts/staff-settlement-assignment-audit.ts](../scripts/staff-settlement-assignment-audit.ts)（PR #125）。
範圍：2025-11-13 ~ 2026-05-12，prod 竹北店。

```
【全顧客 assignedStaffId 覆蓋率】
- 區間內有 COMPLETED booking 的顧客：100.0% 已有 assignedStaffId ✓

【COMPLETED bookings】
- 總筆數：23
- Booking.revenueStaffId 有值：0   (0.0%) 🔴
- Booking.serviceStaffId 有值：0   (0.0%)

【交叉分析】
- revenueStaffId=null AND customer.assignedStaffId!=null
  → 23 筆 (100%)：全部都是 backfill candidates
- revenueStaffId=null AND customer.assignedStaffId=null
  → 0 筆：沒有「真正歸店家」的案例
- revenueStaffId=null AND serviceStaffId!=null
  → 0 筆

【groupBy customer.assignedStaffId → completed booking 數】
- 芊芊店長：23 筆 (100.0%)

【groupBy serviceStaffId → completed booking 數】
- (unassigned)：23 筆 (100.0%)

【跨店異常】
- booking.storeId != customer.storeId：0 ✓
- booking.revenueStaffId staff 不同店：0 ✓
- customer.assignedStaffId staff 不同店：0 ✓
```

#### 判讀：走 **路線 A + 路線 D**

**路線 A — future-only fix（PR-1.5a，next）**：

- 顧客 assignedStaffId 覆蓋率 100%，但 Booking.revenueStaffId 仍 0%。
- Root cause 在 [src/server/actions/booking.ts:439](../src/server/actions/booking.ts:439)
  寫入 `customer.assignedStaffId ?? null`，**沒有套用** helper
  [`resolveCustomerStaffAssignment`](../src/server/services/customer-assignment.ts)。
- Helper 自己的 JSDoc 早已標註 booking creation 為待補項，從未實作。
- PR-1.5a 把該行替換成 resolver 呼叫，自此未來每筆新 booking 都有快照。

**路線 D — backfill dry-run（PR-1.5b，after 1.5a）**：

- 23 筆 backfill candidates 全部對應一位店長（芊芊），語意明確。
- 但仍須先 dry-run 列明細給業主確認，**不直接寫入**。
- 真正 backfill 必須再開獨立 PR，PR description 含 rollback 計畫。

**沒走的路線**：

- B：覆蓋率已 100%，不需先補齊顧客。
- C：serviceStaffId 全 null，沒有「以 serviceStaff 代替 revenueStaff」的誤用風險。

---

## 9. Phase 2 概要（不在本 PR 範圍）

| 模組 | 內容 |
|---|---|
| StaffSettlement | id / storeId / staffId? / periodStart / periodEnd / status(DRAFT/CONFIRMED/PAID/VOIDED) / totalSessions / totalAmount / paidAt / paidByUserId / note |
| StaffSettlementLine | id / settlementId / bookingId / customerId / staffId? / serviceDate / slotTime / serviceFee / amount / sourceType / note |
| 防重複結算 | 每筆 Booking 最多被一張結算單引用一次（unique 約束） |
| 鎖定 | status = CONFIRMED 以上不可修改 |
| 免費服務 | 新增 `Booking.bookingNature` enum 或 `isComplimentary` + reason，**禁止複用 `isMakeup`** |
| 服務費單價 | 「方案 × 店長」對照表，支援補課與一般不同價 |

---

## 10. 變更記錄

- 2026-05-12（初稿）：PR-1 規格 + audit 腳本，audit 數字尚未回填。
- 2026-05-12（audit 回填）：回填 prod read-only audit 數字到 §8.1。
  Sanity check 結論寫入 §8.2，標記兩個 🔴 重大發現：
  (1) prod COMPLETED booking 100% `revenueStaffId = null`，PR-2 已標記為 BLOCKED；
  (2) amount=0 ADJUSTMENT 月均 13.8 筆，免費服務漏洞高頻使用。
  §5.1 補上實際數據。
- 2026-05-12（PR-1.5 re-audit）：顧客指派側鏈（#121/#122/#123/#124）
  上線後重新 audit。結論 §8.3：
  - 顧客 assignedStaffId 覆蓋率 100%（有 booking 的顧客）
  - Booking.revenueStaffId 仍 0% — root cause 鎖定在 booking.ts:439
    沒套 `resolveCustomerStaffAssignment` helper
  - 23 筆全部是 backfill candidates，無跨店異常
  - 路線決策：A + D（PR-1.5a future-only fix → PR-1.5b backfill dry-run）
  §7 PR 路線圖加入 PR-1.5 / 1.5a / 1.5b，PR-2 解 BLOCK 條件改寫。
- 2026-05-12（PR-2 試算頁）：
  - 新增 `src/server/queries/staff-settlement.ts`（read-only query，依
    Booking.revenueStaffId 分組，不引入 resolver，PARTNER manager filter 不可
    被 URL staffId 覆蓋）
  - 新增 `/dashboard/settlements`（試算頁，標題明確含「試算」二字）
  - 重用 `report.read` 權限；歸店家 row 顯示在彙總表最下面，金額固定 $0；
    服務費單價由 client input 即時計算，不入庫
  - 補測 15 個 vitest case（含 PARTNER visibility lockdown）
  - dashboard 首頁加「服務費試算 →」入口
  - §7 PR 路線圖更新：PR-3 改為 xlsx 匯出；Phase 2 PR-4 含正式結算單 + 獨立
    `settlement.*` 權限
- 2026-05-12（警示 banner、PR-2.1a、PR-2.1b）：警示 banner 上線（#130）；
  wallet-level sanity check 抽樣（#131）；operator review CSV worksheet（#132）。
  Operator 對 11 個 risk wallet 完成人工 review，分布為
  CONFIRM_AS_IS:6 / OVERRIDE_TOTAL:4 / EXCLUDE_FROM_SETTLEMENT:1。
- 2026-05-13（PR-2.2 攤提金額，本次）：
  - 新增 §3.7 服務金額計算規則（公式 + 範例 + 資料來源 + bonusSessions
    schema 限制 + operator override 機制 + 計算決策樹 + PII 邊界 + 頁面改名 +
    Phase 2 schema 改造計畫）
  - 標記 §3.5 為 deprecated（由 §3.7 取代）
  - 新增 `data/settlement-wallet-overrides.json`（空陣列預設，由 operator
    review CSV 透過轉換腳本生成）
  - 新增 `src/server/services/settlement-overrides.ts`：JSON 載入、Zod
    驗證、`getOverrideForWallet()` lookup；模組 boot 時 fail-loud 不沉默
    fallback
  - 新增 `scripts/csv-to-settlement-overrides.ts`：CSV → JSON 離線轉換；
    對非法 operatorDecision / 必填欄位缺失立刻 fail fast；不含 PII（不寫
    reviewNote / customerName）
  - 重寫 `src/server/queries/staff-settlement.ts`：每筆 booking 計算
    `amount` / `amountSource` / `needsReview`；補課透過 makeupCredit 溯源
    原 wallet；保守預設：有 ADJUSTMENT 但未經 review 一律 needsReview，不
    硬算
  - 改 `/dashboard/settlements`：移除 fee input、頁面改名「店長服務金額
    試算」、KPI 多一個「需人工確認」、明細表多「金額來源」column、需人工
    確認列加 ⚠️ flag；警示 banner 文案更新（仍為試算，但金額已依攤提算）
  - reports 頁入口按鈕 → 「服務金額試算 →」
  - 補測 17 個 vitest case（query 完全重寫）+ 15 個 settlement-overrides
    schema 測試
  - §7 PR 路線圖更新：PR-2.2 ✅；Phase 2 PR-4 加上 SettlementWalletOverride
    table 取代 JSON
