# 前後台資料一致性驗證清單

> 最後更新：2026-04-06
> 適用版本：commit e63bfad+

## 時區規則

**全系統統一使用 `Asia/Taipei (UTC+8)`**

| 層級 | 實作方式 |
|------|---------|
| DB (Supabase PostgreSQL) | `createdAt` 以 UTC 儲存（Prisma `@default(now())`） |
| 後端查詢 | `monthRange()` 使用 `TZ_OFFSET_HOURS = 8` 做 UTC 偏移 |
| Dashboard | `todayStart/todayEnd` 以 UTC+8 計算本地日期再轉 UTC |
| 報表頁 | `toLocalDateStr()` 取本地日期字串 |
| CSV 匯出 | `monthStart/monthEnd` 同樣使用 UTC+8 偏移 |

---

## 預約相關欄位

### 1. 預約日期 `booking.bookingDate`

| 項目 | 規則 |
|------|------|
| 型別 | `DateTime`（存入時附帶 `T00:00:00Z`） |
| 前台顯示 | `toLocaleDateString("zh-TW", { month, day, weekday })` |
| 後台顯示 | 同上 |
| 篩選邏輯 | `bookingDate: { gte: startOfDay, lte: endOfDay }`（UTC+8 邊界） |

### 2. 預約時段 `booking.slotTime`

| 項目 | 規則 |
|------|------|
| 型別 | `String`（如 `"14:00"`） |
| 來源 | `BookingSlot.startTime` |
| 顯示 | 全系統直接顯示原始字串，無格式化 |

### 3. 預約人數 `booking.people`

| 項目 | 規則 |
|------|------|
| 型別 | `Int`（預設 1） |
| 顯示規則 | **只在 `> 1` 時顯示**（全系統一致） |
| 扣堂單位 | **以 `people` 為單位**，非以預約筆數 |
| 使用位置 | my-plans, book, my-bookings, dashboard, day-view |

### 4. 預約狀態 `booking.bookingStatus`

| 狀態 | 中文 | 前台色 | 後台色 |
|------|------|--------|--------|
| `PENDING` | 待確認 | `yellow-100/700` | `yellow-100/700` |
| `CONFIRMED` | 已確認 | `blue-100/700` | `blue-100/700` |
| `COMPLETED` | 已完成 | `green-100/700` | `green-100/700` |
| `CANCELLED` | 已取消 | `gray-100/500` | `earth-100/500`（淡化+dashed） |
| `NO_SHOW` | 未到 | `red-100/600` | `red-100/600` |

### 5. 取消排除規則

**CANCELLED 預約一律排除於：**
- 今日預約統計（筆數、人數）
- 堂數計算（已使用、已預約）
- 月曆日期統計
- 報表完成堂數
- 營收相關計算

### 6. 補課 `booking.isMakeup`

| 項目 | 規則 |
|------|------|
| 補課預約 | **不扣堂**（計算剩餘時排除 `isMakeup = true`） |
| 顯示 | 標記橙色「補課」badge |
| 來源 | `MakeupCredit` 關聯 |

### 7. 歸屬店長 `booking.revenueStaffId`

| 項目 | 規則 |
|------|------|
| 顯示 | 色點 + 名稱（`staff.colorCode` + `staff.displayName`） |
| 全系統一致 | dashboard、day-view、my-bookings 皆同 |
| 篩選 | 交易頁、顧客頁支援按 staff 篩選 |

---

## 堂數計算（最關鍵）

### 公式

```
已使用 = SUM(booking.people) WHERE status IN (COMPLETED, NO_SHOW) AND isMakeup = false
已預約未使用 = SUM(booking.people) WHERE status IN (CONFIRMED, PENDING) AND isMakeup = false
剩餘可預約 = totalSessions - 已使用 - 已預約未使用
```

### 使用位置與一致性

| 頁面 | 使用方式 | 一致 |
|------|---------|------|
| `/my-plans` 摘要 | people-based 計算 | OK |
| `/my-plans` WalletCard | people-based 計算 | OK |
| `/book` 首頁 | people-based 計算 | OK |
| `/book/new` 配額顯示 | people-based (`computedRemaining`) | OK |
| `/book/new` → CalendarView | `computedRemaining`（非 DB 欄位） | OK |
| 後台顧客詳情 | DB `remainingSessions`（顯示用） | 注意 |

> **重要：** `CustomerPlanWallet.remainingSessions` DB 欄位僅作參考，前台顯示一律使用即時 people-based 計算。

---

## 交易相關欄位

### 交易日期 `transaction.createdAt`

| 項目 | 規則 |
|------|------|
| 儲存 | Prisma `@default(now())` → UTC |
| 查詢 | 使用 UTC+8 偏移邊界 |
| 顯示 | `toLocaleDateString("zh-TW")` |

### 交易金額 `transaction.amount`

| 項目 | 規則 |
|------|------|
| 型別 | `Decimal` |
| 正值 | 購買類（TRIAL_PURCHASE, SINGLE_PURCHASE, PACKAGE_PURCHASE, SUPPLEMENT） |
| 負值 | REFUND |
| 零值 | SESSION_DEDUCTION |

### 營收類型定義

```
REVENUE_TYPES = [TRIAL_PURCHASE, SINGLE_PURCHASE, PACKAGE_PURCHASE, SUPPLEMENT]
```

**一致性：** Dashboard KPI、報表、CSV 匯出皆使用此 4 種類型。

---

## 統計指標

### 今日預約筆數

| 項目 | 值 |
|------|---|
| 查詢 | `booking.aggregate({ _count: { id: true } })` |
| 篩選 | `bookingDate` = today (UTC+8)、`bookingStatus` IN (PENDING, CONFIRMED) |
| 排除 | COMPLETED, NO_SHOW, CANCELLED |

### 今日預約人數

| 項目 | 值 |
|------|---|
| 查詢 | `booking.aggregate({ _sum: { people: true } })` |
| 篩選 | 同上 |

### 今日營收

| 項目 | 值 |
|------|---|
| 查詢 | `transaction.aggregate({ _sum: { amount: true } })` |
| 篩選 | `createdAt` = today (UTC+8)、`transactionType` IN REVENUE_TYPES |
| 排除 | REFUND, SESSION_DEDUCTION, ADJUSTMENT |
| 可見 | 僅 OWNER |

### 本月營收

| 項目 | 值 |
|------|---|
| 查詢 | `transaction.aggregate({ _sum: { amount: true } })` |
| 篩選 | `createdAt` >= monthStart (UTC+8)、`transactionType` IN REVENUE_TYPES |
| 可見 | 僅 OWNER |

---

## CSV 匯出欄位對應

### 全店月報 (`/api/export/store-monthly`)

| CSV 欄位 | 資料來源 | 型別 |
|----------|---------|------|
| 店長 | `staff.displayName` | 文字 |
| 體驗 | `TRIAL_PURCHASE._sum.amount` | 金額 |
| 單次 | `SINGLE_PURCHASE._sum.amount` | 金額 |
| 課程 | `PACKAGE_PURCHASE._sum.amount` | 金額 |
| 補差額 | `SUPPLEMENT._sum.amount` | 金額 |
| 退款 | `REFUND._sum.amount` | 金額（負值） |
| 課程總收 | 體驗+單次+課程+補差額 | 金額 |
| 空間費 | `SpaceFeeRecord.feeAmount` | 金額 |
| 淨收 | 課程總收 + 退款 - 空間費 | 金額 |
| 完成堂數 | `booking._count WHERE COMPLETED` | 整數 |

### 店長月報 (`/api/export/staff-monthly`)

與全店月報相同結構，按個人 `revenueStaffId` 分組。

---

## 驗證 Checklist

- [ ] 前台 `/my-plans` 剩餘堂數 = 後台顧客詳情的堂數
- [ ] 前台 `/book` 首頁剩餘堂 = `/my-plans` 摘要
- [ ] 後台 Dashboard 今日筆數 = 後台完整時段表的非取消預約數
- [ ] 後台 Dashboard 今日人數 = 後台完整時段表的 SUM(people)
- [ ] 報表本月營收 = 交易紀錄頁篩選本月的購買類交易加總
- [ ] CSV 匯出數字 = 報表頁面數字
- [ ] 凌晨 0-8 點（UTC+8）查看報表，日期仍正確
