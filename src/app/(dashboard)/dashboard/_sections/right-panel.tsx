import { getDashboardTodaySummary } from "@/server/queries/dashboard-summary";
import { getLatestReconciliationRun } from "@/server/queries/reconciliation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RightPanelCard } from "@/components/admin/right-panel-card";

interface RightPanelProps {
  activeStoreId: string | null;
  isOwner: boolean;
}

export async function RightPanel({ activeStoreId, isOwner }: RightPanelProps) {
  const [summary, recon] = await Promise.all([
    getDashboardTodaySummary(activeStoreId),
    isOwner
      ? getLatestReconciliationRun().catch(() => null)
      : Promise.resolve(null),
  ]);

  const alerts: Array<{
    tone: "danger" | "warning" | "info";
    title: string;
    hint?: string;
    href?: string;
  }> = [];

  if (summary.todayBookingCount === 0) {
    alerts.push({
      tone: "warning",
      title: "今日尚無預約",
      hint: "建議推播本日限定優惠",
      href: "/dashboard/bookings/new",
    });
  }
  if (summary.todayUnassignedCount > 0) {
    alerts.push({
      tone: "warning",
      title: `${summary.todayUnassignedCount} 筆預約未指派人員`,
      hint: "請協助確認",
      href: "/dashboard/bookings",
    });
  }
  if (summary.noShowCount > 0) {
    alerts.push({
      tone: "danger",
      title: `${summary.noShowCount} 筆未到`,
      hint: "請評估是否改期或結案",
      href: "/dashboard/bookings",
    });
  }
  if (recon && recon.status !== "pass") {
    alerts.push({
      tone: "danger",
      title: "對帳有差異",
      hint: `${recon.mismatchCount} 筆未核對`,
      href: "/dashboard/reconciliation",
    });
  }

  const todos: Array<{ label: string; count: string | number | null; href: string }> = [
    {
      label: "未指派人員",
      count: summary.todayUnassignedCount || null,
      href: "/dashboard/bookings",
    },
    {
      label: "未到需追蹤",
      count: summary.noShowCount || null,
      href: "/dashboard/bookings",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 提醒 */}
      <RightPanelCard
        title="提醒"
        count={alerts.length || undefined}
        countTone={alerts.some((a) => a.tone === "danger") ? "danger" : "warning"}
      >
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-earth-400">
            目前沒有需要處理的提醒
          </p>
        ) : (
          <ul className="space-y-0.5">
            {alerts.slice(0, 4).map((a, i) => (
              <li key={i}>
                <Link
                  href={a.href ?? "/dashboard"}
                  className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-earth-50"
                >
                  <span
                    className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                      a.tone === "danger"
                        ? "bg-red-500"
                        : a.tone === "warning"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-earth-900 truncate">
                      {a.title}
                    </p>
                    {a.hint && (
                      <p className="text-xs text-earth-500 truncate">{a.hint}</p>
                    )}
                  </div>
                  <span className="text-earth-300">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </RightPanelCard>

      {/* 待處理 */}
      <RightPanelCard
        title="待處理"
        rightLink={
          <Link href="/dashboard/bookings" className="hover:text-primary-700">
            查看全部 →
          </Link>
        }
      >
        {todos.every((t) => !t.count) ? (
          <p className="py-4 text-center text-sm text-earth-400">
            目前沒有待處理項目
          </p>
        ) : (
          <ul className="divide-y divide-earth-100">
            {todos
              .filter((t) => t.count)
              .map((t) => (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex items-center justify-between py-2.5 text-sm text-earth-700 hover:text-primary-700"
                  >
                    <span>{t.label}</span>
                    <span className="text-base font-semibold tabular-nums">
                      {t.count}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </RightPanelCard>

      {/* 快速操作 */}
      <RightPanelCard title="快速操作">
        <div className="flex flex-wrap gap-2">
          <QuickActionLink href="/dashboard/bookings/new">＋ 新增預約</QuickActionLink>
          <QuickActionLink href="/dashboard/customers/new">＋ 新增顧客</QuickActionLink>
          <QuickActionLink href="/dashboard/revenue">今日結算</QuickActionLink>
          {isOwner && <QuickActionLink href="/dashboard/settings">設定</QuickActionLink>}
        </div>
      </RightPanelCard>
    </div>
  );
}

function QuickActionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 transition-colors hover:bg-earth-50"
    >
      {children}
    </Link>
  );
}

export function RightPanelSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-earth-200 bg-white p-4">
          <div className="h-5 w-20 rounded bg-earth-100" />
          <div className="mt-3 space-y-2">
            <div className="h-8 rounded bg-earth-50" />
            <div className="h-8 rounded bg-earth-50" />
          </div>
        </div>
      ))}
    </div>
  );
}
