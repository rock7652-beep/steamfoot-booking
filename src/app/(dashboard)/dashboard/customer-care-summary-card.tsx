import { SideCard } from "@/components/desktop";
/**
 * 首頁「今日顧客經營」摘要卡。
 *
 * 只顯示顧客工作台五區的「數字」+ 進入工作台的 CTA；不顯示完整顧客名單。
 * summary === null → 查詢失敗,顯示友善降級文字（首頁其他區塊不受影響）。
 *
 * 完整名單在 /dashboard/growth；首頁只負責提醒店長「今天有事要看」。
 */

const CTA = { label: "前往顧客工作台", href: "/dashboard/growth" } as const;

export interface CustomerWorkspaceSummary {
  birthdayCustomers: number;
  monthlyUnconvertedCustomers: number;
  inactiveCustomers: number;
  lowSessionCustomers: number;
  expiringPlanCustomers: number;
  totalReminders: number;
}

const ROWS: Array<{ key: keyof CustomerWorkspaceSummary; label: string }> = [
  { key: "birthdayCustomers", label: "🎂 本月生日" },
  { key: "monthlyUnconvertedCustomers", label: "🟡 本月體驗未開卡" },
  { key: "inactiveCustomers", label: "💤 好久不見" },
  { key: "lowSessionCustomers", label: "📦 建議安排回店" },
  { key: "expiringPlanCustomers", label: "⏰ 建議續約" },
];

export function CustomerCareSummaryCard({
  summary,
}: {
  summary: CustomerWorkspaceSummary | null;
}) {
  // 查詢失敗 — 降級,不擋首頁
  if (summary === null) {
    return (
      <SideCard title="今日顧客經營" action={CTA}>
        <p className="text-[11px] text-earth-400">顧客經營提醒暫時無法載入</p>
      </SideCard>
    );
  }

  // 無提醒 — 友善空狀態
  if (summary.totalReminders === 0) {
    return (
      <SideCard title="今日顧客經營" action={CTA}>
        <p className="text-xs text-earth-700">今天沒有需要特別關心的顧客</p>
      </SideCard>
    );
  }

  return (
    <SideCard
      title="今日顧客經營"
      subtitle={`今天有 ${summary.totalReminders} 個提醒項目`}
      action={CTA}
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
