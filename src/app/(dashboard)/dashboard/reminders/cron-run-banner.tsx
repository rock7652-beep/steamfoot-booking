/**
 * CronRunBanner — 提醒管理頁頂部「今日批次狀態」橫幅（PR-R1）
 *
 * 動機：取代原本「今日待發送 0」KPI 的誤判 UX。
 * 18:00 後 KPI 寫死 0 會讓「cron 沒跑」看起來跟「cron 跑了沒事做」一樣，
 * 2026-05-24 事故就是因此沒被即時察覺。
 *
 * 渲染規則完全照 `phase` 走，不做任何時間判斷 — 邏輯集中在
 * `getTodayCronRunStatus()`，banner 純展示。
 */

import { formatTWTime } from "@/lib/date-utils";
import type { CronRunBannerData } from "@/server/queries/reminder";

interface BannerStyle {
  border: string;
  bg: string;
  text: string;
  icon: string;
}

const STYLES: Record<string, BannerStyle> = {
  ok: {
    border: "border-green-300",
    bg: "bg-green-50",
    text: "text-green-800",
    icon: "✓",
  },
  info: {
    border: "border-earth-200",
    bg: "bg-earth-50",
    text: "text-earth-700",
    icon: "ℹ",
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50",
    text: "text-amber-800",
    icon: "⚠",
  },
  red: {
    border: "border-red-300",
    bg: "bg-red-50",
    text: "text-red-800",
    icon: "✗",
  },
};

export function CronRunBanner({ data }: { data: CronRunBannerData }) {
  const { phase, scheduledAt, run } = data;

  let style: BannerStyle;
  let title: string;
  let detail: string | null = null;

  switch (phase) {
    case "BEFORE_WINDOW":
      style = STYLES.info;
      title = `今日 ${formatTWTime(scheduledAt, { style: "short" }).split(" ").pop()} 預定執行提醒批次`;
      detail = "批次完成後，這裡會顯示送出 / 失敗筆數。";
      break;

    case "DURING_WINDOW":
      style = STYLES.info;
      title = "提醒批次執行中…";
      detail = "今日 18:00–18:30 為容許窗，過了仍無紀錄會自動標記為未執行。";
      break;

    case "OK":
      style = STYLES.ok;
      title = `今日 ${formatTWTime(run!.finishedAt ?? run!.startedAt, { style: "short" })} 提醒批次完成`;
      detail = `掃描 ${run!.bookingsScanned ?? 0} 筆 / 送出 ${run!.sent ?? 0} / 跳過 ${run!.skipped ?? 0} / 失敗 ${run!.failed ?? 0}`;
      break;

    case "OK_EMPTY":
      style = STYLES.info;
      title = `今日 ${formatTWTime(run!.finishedAt ?? run!.startedAt, { style: "short" })} 提醒批次完成`;
      detail = "明日無需要提醒的預約（掃描 0 筆）。";
      break;

    case "PARTIAL":
      style = STYLES.amber;
      title = `今日 ${formatTWTime(run!.finishedAt ?? run!.startedAt, { style: "short" })} 提醒已送，其他子任務有失敗`;
      detail = `送出 ${run!.sent ?? 0} / 失敗 ${run!.failed ?? 0}（報表快照 / 降級 / 試用到期等子任務未全部成功，請聯絡工程）`;
      break;

    case "FAILED":
      style = STYLES.red;
      title = `今日 ${formatTWTime(run!.startedAt, { style: "short" })} 提醒批次失敗`;
      detail = run!.errorMessage
        ? `錯誤：${run!.errorMessage}`
        : "請聯絡工程查看 Vercel runtime log。";
      break;

    case "MISSING":
      style = STYLES.red;
      title = "今日 18:00 提醒批次未執行";
      detail = "DB 找不到今日的 CronRunLog 紀錄，可能 Vercel 沒有觸發 cron 或 route 沒有進場。請聯絡工程。";
      break;

    case "STARTED_STUCK":
      style = STYLES.red;
      title = `今日 ${formatTWTime(run!.startedAt, { style: "short" })} 提醒批次中斷`;
      detail = "Cron 進場後沒有寫完，可能 timeout 或 process 被 kill。請聯絡工程。";
      break;
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border ${style.border} ${style.bg} px-4 py-3 text-sm ${style.text}`}
      role={phase === "FAILED" || phase === "MISSING" || phase === "STARTED_STUCK" ? "alert" : undefined}
      data-cron-phase={phase}
    >
      <span aria-hidden className="text-base leading-5">
        {style.icon}
      </span>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        {detail && <div className="mt-0.5 text-xs opacity-80">{detail}</div>}
      </div>
    </div>
  );
}
