import { SideCard } from "@/components/desktop";
import type { CustomerCareSummary } from "@/server/queries/customer-care";

/**
 * 首頁「今日顧客經營」摘要卡（PR-2C）
 *
 * 只顯示四區提醒「數字」+ 進入顧客經營頁的 CTA;不讀 / 不顯示完整顧客名單。
 * summary === null → 查詢失敗,顯示友善降級文字（首頁其他區塊不受影響）。
 *
 * 完整名單在 /dashboard/growth；首頁只負責提醒店長「今天有事要看」。
 */

const CTA = { label: "查看顧客經營", href: "/dashboard/growth" } as const;

const ROWS: Array<{ key: keyof CustomerCareSummary; label: string }> = [
  { key: "trialFollowUps", label: "待追蹤體驗客" },
  { key: "inactiveCustomers", label: "好久不見" },
  { key: "lowSessionCustomers", label: "堂數偏低" },
  { key: "expiringPlanCustomers", label: "方案快到期" },
];

export function CustomerCareSummaryCard({
  summary,
  readOnly = false,
}: {
  summary: CustomerCareSummary | null;
  readOnly?: boolean;
}) {
  const action = readOnly ? undefined : CTA;

  // 查詢失敗 — 降級,不擋首頁
  if (summary === null) {
    return (
      <SideCard title="今日顧客經營" action={action}>
        <p className="text-[11px] text-earth-400">顧客經營提醒暫時無法載入</p>
      </SideCard>
    );
  }

  // 無提醒 — 友善空狀態
  if (summary.totalReminders === 0) {
    return (
      <SideCard title="今日顧客經營" action={action}>
        <p className="text-xs text-earth-700">今天沒有特別需要追蹤的顧客</p>
        <p className="text-[11px] text-earth-400">可以專心服務現場顧客</p>
      </SideCard>
    );
  }

  return (
    <SideCard
      title="今日顧客經營"
      subtitle={`今天有 ${summary.totalReminders} 個提醒項目`}
      action={action}
    >
      <ul className="space-y-1">
        {ROWS.map((r) => (
          <li key={r.key} className="flex items-baseline justify-between">
            <span className="text-[11px] text-earth-500">{r.label}</span>
            <span className="tabular-nums text-sm font-semibold text-earth-900">
              {summary[r.key]}
            </span>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}
