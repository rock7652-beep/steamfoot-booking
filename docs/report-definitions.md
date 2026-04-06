# 報表指標定義文件

> 最後更新：2026-04-06
> 適用版本：commit e63bfad+
> 全部時區：**Asia/Taipei (UTC+8)**

---

## 營收指標

### 今日營收

| 項目 | 定義 |
|------|------|
| **計算公式** | `SUM(transaction.amount) WHERE type IN REVENUE_TYPES AND createdAt IN today` |
| **資料表** | `Transaction` |
| **欄位** | `amount` (Decimal) |
| **包含類型** | `TRIAL_PURCHASE`, `SINGLE_PURCHASE`, `PACKAGE_PURCHASE`, `SUPPLEMENT` |
| **排除類型** | `REFUND`, `SESSION_DEDUCTION`, `ADJUSTMENT` |
| **日期篩選** | `createdAt >= todayStart(UTC+8) AND createdAt <= todayEnd(UTC+8)` |
| **時區** | UTC+8（台灣午夜 00:00 = UTC 前日 16:00） |
| **可見角色** | 僅 OWNER |
| **程式位置** | `src/app/(dashboard)/dashboard/page.tsx` |

### 本月營收

| 項目 | 定義 |
|------|------|
| **計算公式** | `SUM(transaction.amount) WHERE type IN REVENUE_TYPES AND createdAt >= monthStart` |
| **資料表** | `Transaction` |
| **包含類型** | `TRIAL_PURCHASE`, `SINGLE_PURCHASE`, `PACKAGE_PURCHASE`, `SUPPLEMENT` |
| **排除類型** | `REFUND`, `SESSION_DEDUCTION`, `ADJUSTMENT` |
| **日期篩選** | `createdAt >= 本月1日 00:00 UTC+8` |
| **可見角色** | 僅 OWNER |
| **程式位置** | `src/app/(dashboard)/dashboard/page.tsx` |

### 淨收入（報表頁）

| 項目 | 定義 |
|------|------|
| **計算公式** | `課程總收入 + 退款金額`（退款為負數，加法等同減法） |
| **課程總收入** | `SUM(amount) WHERE type IN REVENUE_TYPES` |
| **退款金額** | `SUM(amount) WHERE type = REFUND`（負值） |
| **淨收入** | `課程總收入 + 退款` |
| **排除** | `SESSION_DEDUCTION`, `ADJUSTMENT` |
| **程式位置** | `src/server/queries/report.ts → monthlyStoreSummary()` |

### 店長淨收（報表頁 staffBreakdown）

| 項目 | 定義 |
|------|------|
| **計算公式** | `個人課程收入 - 空間費` |
| **注意** | 退款目前歸入全店淨收，不分攤到個人 |
| **程式位置** | `src/server/queries/report.ts → monthlyStoreSummary()` |

---

## 預約指標

### 今日預約筆數

| 項目 | 定義 |
|------|------|
| **計算公式** | `COUNT(booking.id) WHERE date = today AND status IN (PENDING, CONFIRMED)` |
| **資料表** | `Booking` |
| **日期篩選** | `bookingDate >= todayStart(UTC+8) AND bookingDate <= todayEnd(UTC+8)` |
| **狀態篩選** | `PENDING`, `CONFIRMED` |
| **排除** | `COMPLETED`, `NO_SHOW`, `CANCELLED` |
| **說明** | 統計「尚未完成」的預約數，不含已完成/已取消 |
| **程式位置** | `src/app/(dashboard)/dashboard/page.tsx` |

### 今日預約人數

| 項目 | 定義 |
|------|------|
| **計算公式** | `SUM(booking.people) WHERE date = today AND status IN (PENDING, CONFIRMED)` |
| **單位** | 人（非筆） |
| **程式位置** | 同上 |

### 今日已完成

| 項目 | 定義 |
|------|------|
| **計算公式** | `SUM(booking.people) WHERE date = today AND status = COMPLETED` |
| **顯示** | `已完成人數 / 總人數` + 進度條百分比 |
| **程式位置** | `src/app/(dashboard)/dashboard/page.tsx` |

---

## 堂數指標

### 課程剩餘堂數（可預約）

| 項目 | 定義 |
|------|------|
| **計算公式** | `totalSessions - 已使用 - 已預約未使用` |
| **資料表** | `CustomerPlanWallet` + `Booking` |
| **totalSessions** | `CustomerPlanWallet.totalSessions` |
| **已使用** | `SUM(booking.people) WHERE wallet = this AND status IN (COMPLETED, NO_SHOW) AND isMakeup = false` |
| **已預約未使用** | `SUM(booking.people) WHERE wallet = this AND status IN (CONFIRMED, PENDING) AND isMakeup = false` |
| **剩餘** | `totalSessions - 已使用 - 已預約未使用` |
| **重要** | 不使用 DB 的 `remainingSessions` 欄位做顯示，一律即時計算 |

### 已使用堂數

| 項目 | 定義 |
|------|------|
| **計算公式** | `SUM(booking.people) WHERE status IN (COMPLETED, NO_SHOW) AND isMakeup = false` |
| **包含狀態** | `COMPLETED`（已完成）、`NO_SHOW`（未到，仍扣堂） |
| **排除** | `isMakeup = true`（補課不扣堂） |
| **單位** | 人次（booking.people 欄位） |

### 已預約未使用

| 項目 | 定義 |
|------|------|
| **計算公式** | `SUM(booking.people) WHERE status IN (CONFIRMED, PENDING) AND isMakeup = false` |
| **說明** | 已預約但尚未到場的堂數（預扣） |
| **排除** | `isMakeup = true` |
| **單位** | 人次 |

---

## 完成堂數（報表）

| 項目 | 定義 |
|------|------|
| **計算公式** | `COUNT(booking.id) WHERE status = COMPLETED AND bookingDate IN month` |
| **注意** | 報表中的完成堂數是 **筆數** 非人數（與前台不同） |
| **程式位置** | `src/server/queries/report.ts → monthlyStoreSummary()` |

---

## 排除規則彙整

| 指標 | 排除 CANCELLED | 排除 REFUND | 排除 isMakeup | 使用 people |
|------|:-:|:-:|:-:|:-:|
| 今日預約筆數 | YES | — | — | NO (count) |
| 今日預約人數 | YES | — | — | YES |
| 今日已完成 | YES | — | — | YES |
| 今日營收 | — | YES | — | — |
| 本月營收 | — | YES | — | — |
| 淨收入 | — | NO（含退款） | — | — |
| 剩餘堂數 | YES | — | YES | YES |
| 已使用 | YES | — | YES | YES |
| 已預約未使用 | YES | — | YES | YES |
| 完成堂數（報表） | YES | — | — | NO (count) |
| CSV 全店月報 | — | NO（含退款列） | — | — |

---

## 資料來源對照表

| 前台頁面 | 後台對應 | 共用查詢 |
|---------|---------|---------|
| `/my-plans` 剩餘堂數 | 顧客詳情頁 | 同一 people-based 公式 |
| `/book` 首頁剩餘堂 | — | 同上 |
| `/my-bookings` 預約列表 | `/dashboard/bookings` | `listBookings()` |
| — | Dashboard 今日營收 | `transaction.aggregate()` |
| — | 報表月營收 | `monthlyStoreSummary()` |
| — | CSV 匯出 | 獨立查詢（已對齊時區） |
