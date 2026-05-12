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

### 3.5 服務費單價（Phase 1 暫定）

- 由頁面 input 提供（單一數字，例如 300）
- **不入庫、不寫死、不依方案分流**
- 「方案 × 店長」差異化單價留 Phase 2

### 3.6 multi-store

- 一律 store-scoped，沿用 `getManagerReadFilter()`
- 店長角色只能看自己；OWNER / ADMIN 看全店
- 不跨店讀取

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
| **PR-1**（本 PR） | 本規格文件 + read-only 統計腳本 | ❌ | ❌ |
| PR-2 | `src/server/queries/staff-settlement.ts` + vitest 測試 | ❌ | ❌ |
| PR-3 | `/dashboard/settlements` 頁面（server component + 彙總/明細表） | ❌ | ✅ |
| PR-4 | `/api/settlements/export` xlsx 匯出 | ❌ | ✅ |
| PR-5（Phase 2）| StaffSettlement / StaffSettlementLine schema + 鎖定流程 | ✅ | ✅ |

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

### 8.1 待回填欄位

> 跑完後請把這段替換成實際數字。

```
區間：____ ~ ____
店家範圍：____

【Booking 完成服務統計】
- COMPLETED booking 總筆數              : ____
- 其中 isMakeup = true（補課）          : ____
- 其中 isMakeup = false（一般）         : ____
- 其中 revenueStaffId = null（歸店家）  : ____
- 其中 people > 1（多人預約）           : ____

【BookingType 分布】
- FIRST_TRIAL                          : ____
- SINGLE                               : ____
- PACKAGE_SESSION                      : ____

【ADJUSTMENT 交易（贈送漏洞觀察）】
- ADJUSTMENT 總筆數                     : ____
- ADJUSTMENT 且 amount = 0              : ____ ← 最像「贈送」特徵
- ADJUSTMENT 且 amount ≠ 0              : ____ ← 補登/退費/帳調等

【店長覆蓋率】
- 不同 revenueStaffId 數                : ____
- 完成服務分布最高的店長佔比             : ____%
```

### 8.2 數字出來後要回答的問題

跑完統計後，要在合併 PR-1 前釐清下列三件事：

1. **「歸店家」比例**：若 `revenueStaffId = null` 比例 > 5%，
   表示 Phase 1 結算試算會出現大量「不算給任何店長」的列，
   需要與營運確認這部分如何展示與後續結算。
2. **補課比例**：若 isMakeup 佔比過高（例如 > 15%），
   要思考補課是否真的該與一般服務「同單價」結算（業主已拍板：同單價，但數據出來後再 sanity check）。
3. **`adjustRemainingSessions` 使用頻率**：amount=0 的 ADJUSTMENT 筆數，
   若顯著（> 月均 5 筆），代表「免費服務漏洞」實際正在被使用，
   應優先排 Phase 2 的免費服務正式欄位。

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

- 2026-05-12：初稿（PR-1 規格 + audit 腳本）。Audit 數字尚未回填。
