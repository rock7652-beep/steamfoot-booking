import { getCurrentUser } from "@/lib/session";
import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * /dashboard/settings — 設定 landing
 *
 * 店家後台 v1：整併 人員管理 / 方案設定 / 預約開放設定 / 值班排班 / 提醒管理 等設定類功能。
 * 本頁僅為卡片式入口；各子功能仍由原路徑承接，不 reshape 既有頁面。
 */
export default async function SettingsIndexPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  // 僅 OWNER / PARTNER / ADMIN 可進入
  if (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER") {
    notFound();
  }

  const cards: Array<{
    href: string;
    label: string;
    description: string;
    iconPath: string;
  }> = [
    {
      href: "/dashboard/staff",
      label: "人員管理",
      description: "建立員工、指派角色與可視範圍",
      iconPath:
        "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    },
    {
      href: "/dashboard/settings/plan",
      label: "方案設定",
      description: "方案內容、試用狀態、升級申請",
      iconPath:
        "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
    },
    {
      href: "/dashboard/settings/hours",
      label: "預約開放設定",
      description: "營業時間、可預約時段與休假",
      iconPath: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      href: "/dashboard/settings/duty",
      label: "值班排班設定",
      description: "員工值班排定與輪班",
      iconPath:
        "M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75",
    },
    {
      href: "/dashboard/reminders",
      label: "提醒管理",
      description: "LINE 提醒模板與自動通知",
      iconPath:
        "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h1 className="text-lg font-bold text-earth-900">設定</h1>
        <p className="mt-0.5 text-sm text-earth-500">店家後台的系統化設定與管理功能</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex items-start gap-3 rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-200 hover:shadow"
          >
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-earth-50 text-earth-500 group-hover:bg-primary-50 group-hover:text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={c.iconPath} />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-earth-900">{c.label}</p>
              <p className="mt-0.5 text-xs text-earth-500">{c.description}</p>
            </div>
            <svg
              className="mt-1.5 h-4 w-4 shrink-0 text-earth-300 group-hover:text-primary-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
