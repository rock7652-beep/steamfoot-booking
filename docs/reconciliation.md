# 自動對帳系統 v1

> 最後更新：2026-04-06
> 適用版本：穩定模組 v1.2+

---

## 概述

自動對帳系統從多個資料來源取得同一指標的數值，進行交叉比對。當任一數字不一致時標記為異常，保留完整 debug 資訊供追查。

---

## 對帳項目定義

| # | checkCode | 中文名稱 | 比對來源 | 公式 |
|---|-----------|---------|---------|------|
| 1 | `today_revenue` | 今日營收 | aggregate vs 逐筆加總 | `SUM(amount) WHERE type IN REVENUE_TYPES AND createdAt IN today` |
| 2 | `month_revenue` | 本月營收 | aggregate vs groupBy(staff) vs groupBy(staff+type) | `SUM(amount) WHERE type IN REVENUE_TYPES AND createdAt IN month` |
| 3 | `today_booking_count` | 今日預約筆數 | aggregate._count vs count() | `COUNT(id) WHERE date = today AND status IN (PENDING, CONFIRMED)` |
| 4 | `today_booking_people` | 今日預約人數 | aggregate._sum vs 逐筆加總 | `SUM(people) WHERE date = today AND status IN (PENDING, CONFIRMED)` |
| 5 | `month_csv_totals` | CSV 合計列 | 報表 aggregate vs CSV groupBy 合計（課程收入、退款、淨收、完成堂數） | 四組子比對 |

### REVENUE_TYPES

`TRIAL_PURCHASE`, `SINGLE_PURCHASE`, `PACKAGE_PURCHASE`, `SUPPLEMENT`

### 異常規則

- 容許誤差 (tolerance) = **0**，數字必須完全一致
- `mismatch`：計算成功但數字不一致
- `error`：計算過程發生例外（DB 錯誤等）

---

## 資料結構

### ReconciliationRun（對帳執行記錄）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | String | cuid |
| `triggeredBy` | String | `"manual"` / `"cron"` |
| `status` | String | `"running"` / `"pass"` / `"mismatch"` / `"error"` |
| `targetDate` | String | 對帳目標日期 `"YYYY-MM-DD"` |
| `targetMonth` | String | 對帳目標月份 `"YYYY-MM"` |
| `timezone` | String | 時區標記 `"Asia/Taipei (UTC+8)"` |
| `totalChecks` | Int | 總檢查數 |
| `passCount` | Int | 通過數 |
| `mismatchCount` | Int | 不一致數 |
| `errorCount` | Int | 錯誤數 |
| `durationMs` | Int? | 執行耗時（毫秒） |
| `startedAt` | DateTime | 開始時間 |
| `finishedAt` | DateTime? | 結束時間 |

### ReconciliationCheck（單項檢查記錄）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | String | cuid |
| `runId` | String | FK → ReconciliationRun |
| `checkCode` | String | 檢查代碼（如 `today_revenue`） |
| `checkName` | String | 中文名稱 |
| `status` | String | `"pass"` / `"mismatch"` / `"error"` |
| `sources` | Json | 各來源數值 `{ "Dashboard aggregate": 28100, "逐筆加總": 28100 }` |
| `expected` | String? | 期望結果描述 |
| `errorMessage` | String? | 錯誤訊息 |
| `debugPayload` | Json | 完整 debug 資訊 |

### debugPayload 結構範例

```json
{
  "targetDate": "2026-04-06",
  "dateRange": {
    "start": "2026-04-05T16:00:00.000Z",
    "end": "2026-04-06T15:59:59.999Z"
  },
  "timezone": "Asia/Taipei (UTC+8)",
  "formula": "SUM(transaction.amount) WHERE type IN REVENUE_TYPES AND createdAt IN today",
  "revenueTypes": ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"],
  "transactionCount": 5,
  "tolerance": 0
}
```

---

## 執行方式

### 手動執行

1. 登入 Owner 帳號
2. 進入「對帳中心」（`/dashboard/reconciliation`）
3. 點擊「手動執行對帳」按鈕
4. 等待結果（通常 < 3 秒）

### 程式觸發

```typescript
import { runReconciliation } from "@/server/reconciliation/engine";

// 手動觸發
const result = await runReconciliation("manual");

// 排程觸發（未來用）
const result = await runReconciliation("cron");
```

---

## 後台 UI

### Dashboard 警示條

- 位置：Dashboard 首頁最上方
- 觸發條件：最新一筆 run 的 status 為 `mismatch` 或 `error`
- 可見角色：僅 Owner
- 顯示：異常項目名稱 + 時間 + 連結至對帳中心

### 對帳中心 `/dashboard/reconciliation`

- 最新結果摘要（4 格卡片：總檢查/通過/不一致/錯誤）
- 各項檢查明細（sources 表格 + debug payload）
- 歷史列表（最近 20 筆，可點擊查看詳情）
- 手動重新執行按鈕

---

## 未來擴展

### 每日排程

透過 Vercel Cron Jobs 或外部排程服務呼叫 API：

```typescript
// src/app/api/cron/reconciliation/route.ts（未來建立）
import { runReconciliation } from "@/server/reconciliation/engine";

export async function GET(req: Request) {
  // 驗證 cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runReconciliation("cron");
  return Response.json(result);
}
```

`vercel.json` 設定：
```json
{
  "crons": [{
    "path": "/api/cron/reconciliation",
    "schedule": "0 1 * * *"
  }]
}
```

### LINE 通知

在 `runReconciliation()` 結束後，若 status !== "pass"，呼叫 LINE Notify API：

```typescript
// 未來在 engine.ts 的 runReconciliation() 結尾加入：
if (overallStatus !== "pass") {
  await sendLineNotify({
    message: `\n[對帳異常] ${targetDate}\n` +
      `不一致: ${mismatchCount} 項 / 錯誤: ${errorCount} 項\n` +
      failedChecks.map(c => `- ${c.checkName}`).join('\n') +
      `\n詳情: ${process.env.NEXT_PUBLIC_URL}/dashboard/reconciliation`
  });
}
```

### 擴展對帳項目

在 `engine.ts` 的 `checks` 陣列新增函式即可：

```typescript
const checks = [
  checkTodayRevenue,
  checkMonthRevenue,
  checkTodayBookingCount,
  checkTodayBookingPeople,
  checkMonthCsvTotals,
  // 未來新增：
  // checkSessionCount,       // 堂數一致性
  // checkStaffIsolation,     // Manager 資料隔離
  // checkRefundAccounting,   // 退款對帳
];
```

每個 check 函式只需回傳 `CheckResult` 介面即可自動納入 run/check 記錄。
