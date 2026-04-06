# 日期與時區規則

> 最後更新：2026-04-06
> 適用版本：穩定模組 v1.1+

---

## 核心原則

1. **全系統統一 UTC+8 (Asia/Taipei)**
2. **所有日期邏輯集中在 `src/lib/date-utils.ts`**，禁止各檔案自行計算時區偏移
3. **禁止 anti-pattern**：`new Date().toISOString().slice(0, 10)` 不得用於判斷「今天」或「本月」

---

## 資料儲存規則

| 欄位類型 | 儲存格式 | 範例 | 說明 |
|---------|---------|------|------|
| `createdAt` / `updatedAt` | UTC 時間戳 | `2026-04-05T16:00:00.000Z` | Prisma `@default(now())` |
| `bookingDate` | UTC midnight | `2026-04-06T00:00:00.000Z` | 日期欄位，無時區問題 |
| `entryDate` (cashbook) | UTC midnight | `2026-04-06T00:00:00.000Z` | 同上 |
| `birthday` | UTC midnight | `1990-01-15T00:00:00.000Z` | 同上 |
| `spaceFeeRecord.month` | 字串 | `"2026-04"` | 純文字比對 |

---

## 查詢邊界規則

### 查詢 `createdAt`（時間戳欄位）— 需要 UTC+8 偏移

台灣 4/6 一整天 = UTC 4/5 16:00 ~ UTC 4/6 15:59:59.999

```typescript
import { todayRange, monthRange, dayRange } from "@/lib/date-utils";

// 今天
const { start, end } = todayRange();
// start = 2026-04-05T16:00:00.000Z (台灣 4/6 00:00)
// end   = 2026-04-06T15:59:59.999Z (台灣 4/6 23:59)

// 指定月份
const { start, end } = monthRange("2026-04");

// 指定日期
const { start, end } = dayRange("2026-04-06");
```

### 查詢 `bookingDate`（日期欄位）— 使用 UTC midnight

```typescript
import { bookingMonthRange } from "@/lib/date-utils";

const { start, end } = bookingMonthRange(2026, 4);
// start = 2026-04-01T00:00:00.000Z
// end   = 2026-04-30T00:00:00.000Z
```

### 查詢 `entryDate`（日期欄位）— 使用 UTC midnight

與 `bookingDate` 相同，日期欄位儲存為 T00:00:00Z，直接用 UTC 邊界查詢。

---

## 共用函式一覽

| 函式 | 用途 | 回傳 |
|------|------|------|
| `toLocalDateStr(date?)` | 取得台灣日期字串 | `"2026-04-06"` |
| `toLocalMonthStr(date?)` | 取得台灣月份字串 | `"2026-04"` |
| `todayRange()` | 今天的 UTC 邊界（含 dateStr） | `{ start, end, dateStr }` |
| `monthRange(month)` | 指定月份的 UTC 邊界 | `{ start, end }` |
| `dayRange(dateStr)` | 指定日期的 UTC 邊界 | `{ start, end }` |
| `bookingMonthRange(y, m)` | bookingDate 月份邊界 | `{ start, end }` |
| `getPresetDateRange(preset)` | 報表 preset 日期範圍 | `{ startDate, endDate, label }` |

---

## 禁止寫法 vs 正確寫法

### 取得「今天」日期字串

```typescript
// ❌ 禁止 — Vercel UTC 伺服器在台灣 00:00~08:00 會回傳昨天
const today = new Date().toISOString().slice(0, 10);

// ✅ 正確
import { toLocalDateStr } from "@/lib/date-utils";
const today = toLocalDateStr();
```

### 取得「本月」字串

```typescript
// ❌ 禁止
const month = new Date().toISOString().slice(0, 7);

// ✅ 正確
import { toLocalMonthStr } from "@/lib/date-utils";
const month = toLocalMonthStr();
```

### 查詢本月交易

```typescript
// ❌ 禁止 — 純 UTC 邊界，會漏掉台灣時間的資料
const start = new Date(Date.UTC(year, mon - 1, 1));

// ✅ 正確 — 使用共用函式
import { monthRange } from "@/lib/date-utils";
const { start, end } = monthRange("2026-04");
```

---

## 例外情況

以下情況可使用 `toISOString().slice(0, 10)`，不違反規則：

1. **從 DB 讀取的日期欄位轉字串**：`bookingDate.toISOString().slice(0, 10)` — 因為該值本身就是 UTC midnight，轉換結果正確
2. **客戶端元件 (use client)**：瀏覽器的 `new Date()` 使用使用者本地時區，台灣使用者不會有問題
3. **純粹用於 Date 物件間的日期運算**：如 `new Date(Date.UTC(y, m, d+1)).toISOString().slice(0, 10)` 這類已知 UTC 日期的轉換

---

## 驗證方式

測試時區邏輯是否正確：

```bash
# 模擬台灣午夜 ~ 早上 8 點（UTC 16:00 ~ 24:00）
TZ=UTC node -e "
  const { toLocalDateStr, todayRange } = require('./src/lib/date-utils');
  // 假設 UTC 時間是 16:00（台灣隔天 00:00）
  console.log('Today (TW):', toLocalDateStr());
  const r = todayRange();
  console.log('Range:', r.start.toISOString(), '~', r.end.toISOString());
"
```
