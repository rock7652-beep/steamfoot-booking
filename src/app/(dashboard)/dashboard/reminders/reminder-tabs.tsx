"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { useSettingsPanelNavigation } from "@/components/admin/settings-panel-context";
export function ReminderTabs({
  active,
  explicit,
  storeId,
  baseHref = "/dashboard/reminders",
  customerOnly = false,
  coach = false,
}: {
  active: string;
  explicit: boolean;
  storeId: string;
  baseHref?: string;
  customerOnly?: boolean;
  coach?: boolean;
}) {
  const router = useRouter();
  const panelNavigate = useSettingsPanelNavigation();
  const storageKey = `reminder-tab:${storeId}:${baseHref}`;
  useEffect(() => {
    try {
      if (explicit) {
        localStorage.setItem(storageKey, active);
        return;
      }
      const saved = localStorage.getItem(storageKey);
      if (
        saved &&
        (customerOnly ? ["customer", "logs"] : ["manager", "customer", "logs", ...(coach?["coach"]:[])]).includes(saved) &&
        saved !== active
      )
        if (panelNavigate) panelNavigate(`${baseHref}?tab=${saved}`); else router.replace(`?tab=${saved}`);
    } catch {}
  }, [active, explicit, router, storageKey, customerOnly, coach, panelNavigate, baseHref]);
  return (
    <nav aria-label="提醒管理分頁" className="flex border-b border-earth-200">
      {[
        { key: "manager", label: "店長通知" },
        { key: "customer", label: "顧客提醒" },
        ...(coach?[{key:"coach",label:"教練／老師"}]:[]),
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
