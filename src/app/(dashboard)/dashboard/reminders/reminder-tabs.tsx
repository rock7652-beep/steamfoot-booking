"use client";
import { DashboardLink } from "@/components/dashboard-link";
export function ReminderTabs({
  active,
  baseHref = "/dashboard/reminders",
  customerOnly = false,
  coach = false,
  music = false,
}: {
  active: string;
  explicit: boolean;
  storeId: string;
  baseHref?: string;
  customerOnly?: boolean;
  coach?: boolean;
  music?: boolean;
}) {
  return (
    <nav aria-label="提醒管理分頁" className="flex border-b border-earth-200">
      {[
        { key: "manager", label: "店長通知" },
        { key: "customer", label: "顧客提醒" },
        ...(coach?[{key:"coach",label:music ? "教師通知" : "教練通知"}]:[]),
        { key: "logs", label: "發送紀錄" },
      ].filter(t => !customerOnly || t.key !== "manager").map((t) => (
        <DashboardLink
          key={t.key}
          href={`${baseHref}?tab=${t.key}`}
          aria-current={active === t.key ? "page" : undefined}
          onMouseDown={(event) => event.preventDefault()}
          className={`flex-1 border-b-2 px-3 py-3 text-center text-sm font-medium outline-none transition-colors focus:ring-0 focus:outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 sm:flex-none ${active === t.key ? "border-primary-700 text-primary-700" : "border-transparent text-earth-500 hover:text-primary-700"}`}
        >
          {t.label}
        </DashboardLink>
      ))}
    </nav>
  );
}
