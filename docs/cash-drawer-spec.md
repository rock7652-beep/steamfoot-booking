# 現金抽屜 Cash Drawer 規格書

> 最後更新：2026-05-13
> 階段：PR-1（read-only 設計文件，未進入實作）
> 前置依賴：Transaction refund v2 (#89) 收尾、Paper-customer migration 收尾

---

## 概述

「現金抽屜」是店內每日「開店點錢 → 營業中收付 → 閉店點錢 → 短溢核對」的責任制機制。它**不是零用金**（不是每天歸零的固定備用金），而是一筆持續滾動的店內現金結餘。

每間店每日產生一筆 `CashDrawerSession`，紀錄當日開閉店金額、現金異動、差額原因與經手人。閉店後產生的「閉店帳面結餘」即為隔日開店帳面現金。

---

## 三個最高原則

1. **現金抽屜是滾動結餘** — 今日開店帳面現金 = 上一個營業日閉店帳面結餘，不是每天固定重設。
2. **現金提領不是支出** — 提領（老闆領現、存銀行、轉總部）只減少現金抽屜，不影響營收、費用、損益、店長服務費結算。
3. **現金補入不是收入** — 補入（補找零金、保險箱補現）只增加現金抽屜，不影響營收、收入報表。

---

## 與既有模組的定位關係

### CashbookEntry（既有，保留為雜支帳）

[prisma/schema.prisma:1054](../prisma/schema.prisma) 的 `CashbookEntry` 為**店內雜支收支帳**（水電、材料、雜項），與現金抽屜**並行存在**，**不合併**。

| 模組 | 用途 | 是否本次新增 |
|------|------|------|
| `CashbookEntry` | 雜支收支帳（INCOME / EXPENSE / WITHDRAW / ADJUSTMENT），不含 session 概念 | 既有，不動 |
| `Transaction` | 顧客交易（含 `paymentMethod`），權威來源 | 既有，不動 |
| `CashDrawerSession` | 每日開閉店 session、滾動結餘 | **新增** |
| `CashDrawerEntry` | 營業中現金抽屜手動異動（提領 / 補入 / 調整） | **新增** |

### 為什麼不塞進 CashbookEntry

1. CashbookEntry 的 `WITHDRAW` 既有語意是「雜支領現」，硬塞會污染歷史資料的語意。
2. CashbookEntry 是流水帳結構，沒有 session、開閉店、滾動結餘概念。
3. 報表若把 CashbookEntry 的 EXPENSE 當費用，現金提領被誤算為費用會影響損益。
4. CashDrawer 需要嚴格的「閉店後鎖定 + 調整單留痕」稽核流程，CashbookEntry 沒有這層保護。

---

## 現況盤點（PR-1 read-only）

### 已具備的基礎

| 項目 | 現況 | 檔案 |
|------|------|------|
| 多店隔離 | `Transaction.storeId` 必填，32 個 model 皆帶 `storeId` | [prisma/schema.prisma:959](../prisma/schema.prisma) |
| 付款方式 enum | `CASH, TRANSFER, LINE_PAY, CREDIT_CARD, OTHER, UNPAID` | [prisma/schema.prisma:162](../prisma/schema.prisma) |
| 營業日工具 | UTC+8 統一 `toLocalDateStr / monthRange / dayRange` | [src/lib/date-utils.ts](../src/lib/date-utils.ts) |
| 自動對帳 | `ReconciliationRun` + `ReconciliationCheck` | [docs/reconciliation.md](./reconciliation.md) |
| Transaction void v1 | 已 merge，含 `voidedAt / voidedByUserId / voidReason / TransactionAuditLog` | PR #88 |
| 雜支帳 | CashbookEntry model + actions + queries 已存在（UI 在另一 worktree） | [src/server/queries/cashbook.ts](../src/server/queries/cashbook.ts) |

### 尚未具備的功能（本次要新增）

| 項目 | 現況 |
|------|------|
| 今日現金收入獨立計算 | ❌ Dashboard `todayRevenue` 把所有 paymentMethod 一起加，沒有 cash filter |
| 今日現金支出獨立計算 | ❌ Transaction 沒有支出概念；CashbookEntry 的 EXPENSE 沒接進現金流 |
| 現金提領 / 補入 | ❌ 完全沒有獨立的「不影響損益」現金移動概念 |
| 開閉店 session | ❌ 沒有 session 結構 |
| 滾動結餘 | ❌ 沒有跨日結餘傳遞 |
| 短溢核對 | ❌ 沒有差額紀錄欄位 |

---

## 資料表方向

> **PR-1 只定方向**，欄位最終以 PR-2 schema PR 為準。

### CashDrawerSession（每店每營業日 1 筆）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | String | cuid |
| `storeId` | String | 必填，多店隔離 |
| `businessDate` | Date | 營業日（UTC+8 邊界） |
| `status` | Enum | `OPEN` / `CLOSED` / `NEED_REVIEW` |
| `openingBookBalance` | Decimal | 系統帶入：上日 `finalBookBalance`（第一次啟用由 OWNER 輸入） |
| `openingActualCash` | Decimal | 店長實際點到金額 |
| `openingDifference` | Decimal | `openingActualCash - openingBookBalance`（非 0 必填原因） |
| `openingNote` | String? | 開店差額原因 |
| `openedByStaffId` | String | 開店操作員 |
| `openedAt` | DateTime | 開店時間 |
| `cashIncomeTotal` | Decimal | 閉店時快照：當日 Transaction CASH 收入合計 |
| `cashExpenseTotal` | Decimal | 閉店時快照：當日 Transaction CASH 退款合計（refund v2 反向交易） |
| `cashWithdrawalTotal` | Decimal | 閉店時快照：CashDrawerEntry 提領合計 |
| `cashDepositTotal` | Decimal | 閉店時快照：CashDrawerEntry 補入合計 |
| `cashAdjustmentTotal` | Decimal | 閉店時快照：CashDrawerEntry 調整合計 |
| `expectedClosingCash` | Decimal | 系統算出的應有現金 |
| `closingActualCash` | Decimal | 店長實際點到金額 |
| `closingDifference` | Decimal | `closingActualCash - expectedClosingCash`（非 0 必填原因） |
| `closingNote` | String? | 閉店差額原因 |
| `closedByStaffId` | String? | 閉店操作員 |
| `closedAt` | DateTime? | 閉店時間 |
| `finalBookBalance` | Decimal? | 閉店帳面結餘 = `expectedClosingCash`（維持帳面責任鏈，差額不吃進結餘） |
| `createdAt` / `updatedAt` | DateTime | 系統時間 |

**唯一鍵：** `@@unique([storeId, businessDate])` — 每店每日只能有一個 session。

### CashDrawerEntry（營業中現金抽屜手動異動）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | String | cuid |
| `storeId` | String | 必填 |
| `sessionId` | String | FK → CashDrawerSession |
| `businessDate` | Date | 冗餘欄位方便查詢 |
| `type` | Enum | `CASH_WITHDRAWAL` / `CASH_DEPOSIT` / `CASH_ADJUSTMENT` |
| `amount` | Decimal | 金額（正數） |
| `direction` | Enum | `IN` / `OUT`（方便加總） |
| `reason` | String | 原因（必填） |
| `note` | String? | 備註 |
| `createdByStaffId` | String | 操作員 |
| `createdAt` | DateTime | 建立時間 |

**注意：顧客現金交易不寫入此表**，避免雙重來源。

---

## 顧客現金交易的來源（重要設計決策）

當日顧客現金收付**直接 query `Transaction`**，不複寫到 `CashDrawerEntry`：

```sql
-- 當日現金收入（PSEUDO）
SELECT SUM(amount)
FROM Transaction
WHERE storeId = :storeId
  AND paymentMethod = 'CASH'
  AND status = 'SUCCESS'
  AND transactionDate BETWEEN session.openedAt AND session.closedAt
  -- 排除 VOIDED / REFUNDED
  AND voidedAt IS NULL
```

**理由：**
- Transaction 是顧客交易的唯一權威來源
- 避免雙重寫入造成不一致
- Refund v2 的反向交易會自動處理退款（負向金額）

**邊界規則：**
- 跨日交易歸屬：以 `Transaction.transactionDate`（業務日）為準，**不是 `createdAt`**
- 排除狀態：`VOIDED`、`REFUNDED` 的原交易（refund v2 的反向交易另外計算）
- 排除付款方式：非 `CASH` 的交易完全不影響現金抽屜

---

## 各類型對報表的影響（核心對照表）

| 類型 | 來源 | 影響營收 | 影響費用 | 影響損益 | 影響服務費結算 | 影響現金抽屜 |
|------|------|---------|---------|---------|--------------|------------|
| 顧客現金付款 | Transaction `CASH` | ✅ | ❌ | ✅ | ✅ | ✅ +amount |
| 顧客轉帳付款 | Transaction `TRANSFER` | ✅ | ❌ | ✅ | ✅ | ❌ |
| 顧客刷卡付款 | Transaction `CREDIT_CARD` / `LINE_PAY` | ✅ | ❌ | ✅ | ✅ | ❌ |
| 顧客現金退款 | Transaction refund v2 (CASH) | ✅ -amount | ❌ | ✅ | ✅ | ✅ -amount |
| 雜支現金支出 | CashbookEntry `EXPENSE` | ❌ | ✅ | ✅ | ❌ | ✅ -amount（PR-4 接入） |
| **現金提領** | CashDrawerEntry `CASH_WITHDRAWAL` | ❌ | ❌ | ❌ | ❌ | ✅ -amount |
| **現金補入** | CashDrawerEntry `CASH_DEPOSIT` | ❌ | ❌ | ❌ | ❌ | ✅ +amount |
| **現金調整** | CashDrawerEntry `CASH_ADJUSTMENT` | ❌ | ❌ | ❌ | ❌ | ✅ ±amount |

**最關鍵的兩列**：現金提領與現金補入「**只**」影響現金抽屜結餘，**完全不**進入營收 / 費用 / 損益 / 服務費結算的任何一條路徑。

---

## 滾動結餘公式

```
今日開店帳面現金 = 上一個營業日 finalBookBalance
                   （第一次啟用由 OWNER 手動輸入）

今日 expectedClosingCash
  = openingBookBalance（注意：不是 openingActualCash，差額已留在 openingDifference）
  + cashIncomeTotal           (Transaction CASH 收入)
  - cashExpenseTotal          (Transaction CASH 退款)
  - cashWithdrawalTotal       (CashDrawerEntry 提領)
  + cashDepositTotal          (CashDrawerEntry 補入)
  ± cashAdjustmentTotal       (CashDrawerEntry 調整)

closingDifference = closingActualCash - expectedClosingCash
finalBookBalance  = expectedClosingCash  // 維持帳面責任鏈，差額不吃進結餘
```

> **errata（PR-2 修正）**：原 spec 寫 `finalBookBalance = closingActualCash` 與「expectedClosingCash 用 openingBookBalance」的鐵則自相矛盾。
>
> 若 `finalBookBalance = closingActualCash`，隔日 `openingBookBalance` 會從實際金額起算，短溢被默默吃進結餘鏈，違背帳面責任鏈鐵則。
>
> 正確設計：`finalBookBalance = expectedClosingCash`。短溢由 `closingDifference / closingNote` 留痕；若 OWNER 要正式認列，請在下一個 OPEN session 新增 `CASH_ADJUSTMENT`（短少用 OUT、溢出用 IN），不修改歷史 session。

> **設計細節：為什麼 expectedClosingCash 用 `openingBookBalance` 而非 `openingActualCash`**
>
> 現金抽屜要維持「帳面責任鏈」。如果用 `openingActualCash` 當計算基準，開店實點的差額會被自動吃進今日結餘，等於默默承認昨日（或開店前）的短溢。
>
> 範例：
> - 昨日閉店帳面 8,100，今日開店實點 8,000（短少 100）
> - 若用 `openingActualCash`：今天從 8,000 開始算 → -100 被洗掉，沒人負責
> - 正確做法：今天帳面仍從 8,100 開始算，-100 留在 `openingDifference` 由開店人填原因
>
> 差額本身由 `openingDifference` 紀錄留痕，不進入結餘鏈。

---

## 操作流程

### A. 第一次啟用（OWNER）

1. OWNER 進入「現金抽屜」
2. 輸入：
   - `openingBookBalance`（自定，例如 5,050）
   - `openingActualCash`（實際點到，建議與 BookBalance 相同，否則必填原因）
   - 備註
3. 系統建立第一筆 `CashDrawerSession`，status = `OPEN`
4. 從此每日滾動

### B. 每日開店

1. 系統自動帶出 `openingBookBalance = 上日 finalBookBalance`
2. 店長輸入 `openingActualCash`
3. `openingDifference` 非 0 → 必填 `openingNote`
4. 系統建立當日 session（status = `OPEN`）

### C. 營業中

- 顧客現金交易：自動透過 `Transaction.paymentMethod=CASH` 計入
- 店長可手動新增 `CashDrawerEntry`：
  - 現金提領（OUT）
  - 現金補入（IN）
  - 現金調整（IN/OUT，需原因）

### D. 閉店

1. 系統計算 `expectedClosingCash`（公式如上），凍結快照欄位
2. 店長輸入 `closingActualCash`
3. `closingDifference` 非 0 → 必填 `closingNote`
4. 系統產生 `finalBookBalance`，status → `CLOSED`
5. 隔日開店時自動帶入

---

## 範例情境（驗收用）

### 情境 1：第一次啟用
```
openingBookBalance = 5,050
openingActualCash  = 5,050
openingDifference  = 0
session status: OPEN
```

### 情境 2：當日有現金收入
```
openingBookBalance = 5,050
當日 Transaction CASH 收入合計 = 8,050
expectedClosingCash = 5,050 + 8,050 = 13,100
```

### 情境 3：當日提領現金
```
expectedClosingCash 計算前狀態 = 13,100
CashDrawerEntry CASH_WITHDRAWAL = 5,000
expectedClosingCash = 13,100 - 5,000 = 8,100
```

### 情境 4：隔日開店（正常）
```
openingBookBalance = 8,100 (= 上日 finalBookBalance)
openingActualCash  = 8,100
openingDifference  = 0
```

### 情境 5：隔日開店（短少）
```
openingBookBalance = 8,100
openingActualCash  = 8,000
openingDifference  = -100
openingNote = 必填
```

### 情境 6：現金提領不影響營收（必驗）
```
提領 5,000 後：
- 當日營收：不變
- 當日費用：不變
- 損益：不變
- 店長服務費結算：不變
- 現金抽屜結餘：-5,000
```

### 情境 7：現金補入不影響營收（必驗）
```
補入 2,000 後：
- 當日營收：不變
- 收入報表：不變
- 損益：不變
- 現金抽屜結餘：+2,000
```

---

## 多分店設計

- 每店獨立 session：`@@unique([storeId, businessDate])`
- 每店獨立滾動：A 店的 `finalBookBalance` 不會傳給 B 店
- 啟用時點獨立：竹北店先啟用，新店加入時各自決定第一筆 `openingBookBalance`
- 既有 `getStoreFilter`（[manager-visibility.ts](../src/lib/manager-visibility.ts)）邏輯沿用，無需新發明

---

## 權限建議

新增權限鍵（PR-2 落地）：

| 權限 | OWNER | ADMIN | STAFF |
|------|-------|-------|-------|
| `cashDrawer.read` | ✅ | ✅ | ✅ |
| `cashDrawer.open` | ✅ | ✅ | ✅ |
| `cashDrawer.close` | ✅ | ✅ | ✅ |
| `cashDrawer.withdraw` | ✅ | ✅ | ❌（或需備註）|
| `cashDrawer.deposit` | ✅ | ✅ | ❌（或需備註）|
| `cashDrawer.adjust` | ✅ | ✅ | ❌ |
| `cashDrawer.initSetup` | ✅ | ❌ | ❌ |
| `cashDrawer.reopen` | ✅ | ❌ | ❌ |

- 初始現金設定限 OWNER
- 重開已閉店 session 限 OWNER
- 規則對齊 [docs/role-permission-matrix.md](./role-permission-matrix.md)

---

## 稽核與不可逆設計

**閉店後 session 鎖定**（已確認決策）：

- 閉店後不允許直接修改任何欄位
- 發現差額或錯誤：透過新增 `CashDrawerEntry CASH_ADJUSTMENT` 在**下一日 session** 留痕修正
- 所有修改進入 audit log（操作員、時間、修改前後值、原因）
- 不允許 hard delete，只能 void / correction
- OWNER 可以 `cashDrawer.reopen` 重開已閉店 session，但每次操作留 audit log

> 對齊既有 Transaction void 模式（[PR #88](https://github.com/anthropics/booking-system/pull/88)），不重新發明稽核機制。

---

## 已確認決策（PR-1 拍板）

| # | 決策 | 狀態 |
|---|------|------|
| 1 | Cash Drawer 獨立設計，不塞進 CashbookEntry | ✅ |
| 2 | 顧客現金交易來源 = Transaction `paymentMethod=CASH`，排除 VOIDED/REFUNDED；不複寫到 CashDrawerEntry | ✅ |
| 3 | 第一次啟用不 backfill 歷史；OWNER 啟用當天手動輸入第一筆 | ✅ |
| 4 | 每店獨立啟用，竹北店為第一個正式場景；設計保留多分店能力 | ✅ |
| 5 | 每日 1 個 session；不做多班次、不做跨夜營業 | ✅ |
| 6 | 閉店後 session 鎖定；差額修正走調整單 + audit log | ✅ |
| 7 | 現金提領 / 補入絕對不影響營收、費用、損益、服務費結算 | ✅ |
| 8 | Reconciliation 第一輪不整合，後續再加現金抽屜對帳 check | ✅ |
| 9 | 首頁今日待辦與報表整合放到後期 PR | ✅ |
| 10 | PR-1 只做文件；refund v2 / paper-migration 收尾前不啟動 PR-2 | ✅ |

---

## 影響範圍

| 模組 | 是否動到 | 動到時機 |
|------|----------|----------|
| Transaction schema | ❌ 不動 | — |
| Transaction 邏輯 | ❌ 不動 | — |
| CashbookEntry | ❌ 不動（保留為雜支帳） | — |
| Dashboard summary | 🟡 加「今日待辦：開閉店點錢」提示 | PR-6 |
| 營收報表 | ❌ 不動 | — |
| Staff settlement | ❌ 不動（現金提領不參與服務費結算） | — |
| Reconciliation | 🟡 後續可加現金抽屜對帳 check | 第一輪後 |
| 權限矩陣 | 🟡 新增 `cashDrawer.*` 權限鍵 | PR-2 |
| 多分店隔離 | ✅ 沿用既有 storeId 機制 | — |

---

## 風險

| 風險 | 緩解 |
|------|------|
| 與 refund v2 / paper-migration 平行 → 違反「一條財務主線」原則 | PR-2 啟動前確認兩條主線已收尾 |
| CashbookEntry 與 CashDrawer 共存可能讓使用者混淆 | 文件 + UI 命名清楚區分；後續視情況再決定 CashbookEntry 命運 |
| 歷史資料 backfill 風險 | 不 backfill，從啟用當天起算 |
| 跨日 / 跨班次假設不成立 | 每日 1 session 為當前明確需求；若未來有夜班需求需重新設計 |
| 閉店後修改的可逆性 | 鎖定 + 調整單 + audit log，對齊 Transaction void 模式 |
| Refund v2 反向交易進入現金抽屜的時間點 | 以 `transactionDate` 為準，明確排除 VOIDED |
| 第一次啟用點錯金額 | OWNER 限定權限；初始 session 允許 OWNER 修正一次（其他情況一律走調整單） |

---

## 分 PR 計畫

| PR | 內容 | Schema 異動 | 前置依賴 |
|----|------|-----------|---------|
| **PR-1** | 本文件（read-only 設計） | ❌ | 無 |
| **PR-2** | Schema + service layer + 單元測試（**不開 UI**） | ✅ migration | refund v2、paper-migration 收尾 |
| **PR-3** | 開店點錢 + 第一次啟用 UI | ❌ | PR-2 |
| **PR-4** | 現金提領 / 補入 / 調整 UI | ❌ | PR-3 |
| **PR-5** | 閉店點錢 + 差額原因 + 滾動結餘銜接 | ❌ | PR-4 |
| **PR-6** | 首頁今日待辦 + 報表整合 | ❌ | PR-5 |

### 各 PR 風險檢查點

- **PR-2 開工前**：必須再次確認沒有平行進行的 transaction / refund / cashbook PR
- **PR-3 開工前**：確認 PR-2 的 service 層單元測試覆蓋滾動結餘公式（含跨日 / 退款 / 提領組合）
- **PR-5 開工前**：實機驗證情境 6、情境 7（提領/補入不影響營收）
- **PR-6 開工前**：確認 Reconciliation 不會把 CashDrawerEntry 誤算成費用

---

## PR-1 驗收標準

- [x] 不改 schema
- [x] 不跑 migration
- [x] 不改 Transaction / 報表 / CashbookEntry 邏輯
- [x] 不影響竹北店正式操作
- [x] 文件清楚描述 CashDrawerSession / CashDrawerEntry 定位
- [x] 文件明確寫出「現金提領不是支出、現金補入不是收入、現金抽屜是滾動結餘」三大原則
- [x] 文件列出 PR-2 ~ PR-6 開發順序與風險
- [x] 10 條已確認決策落地

---

## PR-2 啟動前置條件（檢查清單）

啟動 PR-2 schema/service 前必須確認：

- [ ] Transaction refund v2 (PR #89) 已 merge 並穩定
- [ ] Paper-customer migration 系列 PR (PR-A/B/C) 已收尾
- [ ] Cashbook v1 PR-A 命運已確認（合進 main / 廢掉 / 共存）
- [ ] 沒有其他平行進行的財務主線 PR
- [ ] 跟 OWNER 對齊本文件決策無誤

---

## 相關文件

- [docs/role-permission-matrix.md](./role-permission-matrix.md) — 權限矩陣
- [docs/reconciliation.md](./reconciliation.md) — 自動對帳系統（後續整合參考）
- [docs/transaction-v1-acceptance-checklist.md](./transaction-v1-acceptance-checklist.md) — Transaction void 模式（稽核參考）
- [docs/transaction-refund-v2-manager-guide.md](./transaction-refund-v2-manager-guide.md) — Refund v2 反向交易（CASH 退款計算依據）
- [docs/date-time-rules.md](./date-time-rules.md) — UTC+8 營業日定義
