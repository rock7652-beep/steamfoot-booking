# Reminder System — 架構決策

**狀態**：Active（自 2026-05-11 起）
**前次重大改動**：[PR #116](https://github.com/rock7652-beep/steamfoot-booking/pull/116) 引入 `triggerAt` + unique 索引；本次 hotfix 改為 daily next-day batch。

---

## 當前設計

**每天台灣時間 18:00（UTC 10:00），單次 cron 觸發提醒引擎**，掃描「明天 (TW)」的所有
PENDING / CONFIRMED 預約（顧客已綁 LINE），對每筆發送一則 LINE 提醒。

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 10 * * *" }
  ]
}
```

關鍵檔案：

- 引擎：[src/server/reminder-engine.ts](../src/server/reminder-engine.ts) — `runReminders()`
- Cron route：[src/app/api/cron/reminders/route.ts](../src/app/api/cron/reminders/route.ts)
- Dashboard 統計：[src/server/queries/reminder.ts](../src/server/queries/reminder.ts) — `getReminderStats()`
- Dedupe 鍵：`MessageLog @@unique([ruleId, bookingId, triggerAt])`，
  `triggerAt` 一律寫入「今天 18:00 TW」對應的 UTC 時刻（`todayReminderTriggerAt()`）

## ⛔ 不要改的事

### 1. 不要把 cron 改成分鐘級（`*/30`、`*/15` 等）

**Vercel Hobby plan 不支援分鐘級 cron**。任何嘗試把 schedule 改成 `*/N * * * *`
都會讓 production deploy 直接失敗（vercel.link 會 redirect 到 cron pricing 文件），
prod 會卡在前一個成功的 deploy。

歷史教訓：
- **PR #116**（2026-05-11）原本走 `*/30 * * * *`，merge 後 prod deploy 立刻 failed，
  prod 沒有跟新（schema 卻已透過手動 SQL 跟上），耗了一輪 hotfix 才回到可部署狀態
- 本次 hotfix（2026-05-11）改為 daily 模式

如果未來真的需要分鐘級精度（例如即時對帳、不同 offset 的提醒），先做以下其中一件：

1. 升 Vercel Pro（$20/月）→ 才能用 `*/30`
2. 接外部 scheduler（GitHub Actions / cron-job.org）→ workflow 必須帶 `CRON_SECRET`，
   且開 PR 時 GitHub PAT 需有 `workflow` scope 才能 push `.github/workflows/*.yml`

**不要默默把 schedule 改回分鐘級就 commit**，會把 prod deploy 弄壞。

### 2. 不要保留「`triggerAt` 是預約前 N 小時/分鐘」的概念

引擎已不再用 sliding window。`triggerAt` 在當前設計裡固定 = 「今天 18:00 TW」，
純粹是為了讓 `(ruleId, bookingId, triggerAt)` unique 鍵在「同一天重跑」時擋下重複。
顧客改期到不同日子 → 隔天執行時 `triggerAt` 是隔天的 18:00，自然能重發新提醒。

### 3. 不要在 ReminderRule 上重新依賴 `type / offsetMinutes / offsetDays / fixedTime`

這幾個欄位在 schema 上保留（避免 migration），但 daily-batch engine **完全不讀**。
任何 enabled rule 都會在 18:00 觸發，對「明天的所有有效預約」發送。如果同時啟用多
條規則，每筆預約會收到多則提醒（每條 rule 一則）— 這是預期行為，但通常用單一規則。

## 顧客體驗誤差

| 預約時段（明天） | 提前通知時間（從今天 18:00 起算） |
|---|---|
| 10:00 | 16 小時 |
| 14:00 | 20 小時 |
| 18:00 | 24 小時 |
| 22:00 | 28 小時 |

對「蒸足預約」這類 1 天前提醒就足夠的場景可接受。如未來改為「精準前 12hr」需求，
回到「不要改的事 #1」評估升 Pro 或外部 scheduler。

## Daily cron 也順便跑這些每日任務（同一條 `/api/cron/reminders`）

1. Reminders（next-day batch）
2. 上月報表快照預先計算
3. 處理排程降級（StorePlan downgrade）
4. 處理試用到期
5. ErrorLog 清理（30 天前）

時段選 18:00 TW 是「顧客比較會看 LINE 的時段」優先，每日批次任務時段不敏感，跟著走。
