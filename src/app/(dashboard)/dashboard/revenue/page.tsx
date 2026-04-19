import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * /dashboard/revenue — 營收 landing（店家後台 v1）
 *
 * 整併 收入總覽 / 交易紀錄 / 收支明細（現金帳 + 對帳中心）。
 * 本頁為卡片式入口，各分頁仍由既有獨立路徑承接，不改既有頁面。
 */
export default async function RevenueIndexPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // transaction.read 為最低門檻（與營收 sidebar 項目一致）
  const allowed = await checkPermission(user.role, user.staffId, "transaction.read");
  if (!allowed) redirect("/dashboard");

  const cards: Array<{
    href: string;
    label: string;
    description: string;
    iconPath: string;
  }> = [
    {
      href: "/dashboard/store-revenue",
      label: "收入總覽",
      description: "本月、本季、全年的店營收報表",
      iconPath:
        "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
    },
    {
      href: "/dashboard/transactions",
      label: "交易紀錄",
      description: "所有收款、退款、點數與帳務明細",
      iconPath:
        "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    },
    {
      href: "/dashboard/cashbook",
      label: "現金帳",
      description: "手工收支記帳與餘額對照",
      iconPath:
        "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      href: "/dashboard/reconciliation",
      label: "對帳中心",
      description: "系統自動對帳，掌握收支差異",
      iconPath:
        "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h1 className="text-lg font-bold text-earth-900">營收</h1>
        <p className="mt-0.5 text-sm text-earth-500">
          收入總覽、交易紀錄、現金帳與對帳，統一入口
        </p>
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
