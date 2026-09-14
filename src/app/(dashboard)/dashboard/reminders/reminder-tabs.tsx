"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
export function ReminderTabs({
  active,
  explicit,
  storeId,
}: {
  active: string;
  explicit: boolean;
  storeId: string;
}) {
  const router = useRouter();
  const storageKey = `reminder-tab:${storeId}`;
  useEffect(() => {
    try {
      if (explicit) {
        localStorage.setItem(storageKey, active);
        return;
      }
      const saved = localStorage.getItem(storageKey);
      if (
        saved &&
        ["manager", "customer", "logs"].includes(saved) &&
        saved !== active
      )
        router.replace(`?tab=${saved}`);
    } catch {}
  }, [active, explicit, router, storageKey]);
  return (
    <nav aria-label="提醒管理分頁" className="flex border-b border-earth-200">
      {[
        { key: "manager", label: "店長通知" },
        { key: "customer", label: "顧客提醒" },
        { key: "logs", label: "發送紀錄" },
      ].map((t) => (
        <DashboardLink
          key={t.key}
          href={`/dashboard/reminders?tab=${t.key}`}
          aria-current={active === t.key ? "page" : undefined}
          className={`flex-1 border-b-2 px-3 py-3 text-center text-sm font-medium sm:flex-none ${active === t.key ? "border-primary-700 text-primary-700" : "border-transparent text-earth-500"}`}
        >
          {t.label}
        </DashboardLink>
      ))}
    </nav>
  );
}
