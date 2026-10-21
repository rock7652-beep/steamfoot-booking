import { redirect } from "next/navigation";
import { PageShell, PageHeader } from "@/components/desktop";
import { BeautyDashboard } from "@/components/beauty/dashboard";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { prisma } from "@/lib/db";
import { beautyManager } from "@/server/beauty/access";
import { beautyDashboard } from "@/server/beauty/queries";
import { tabs } from "@/lib/beauty/contracts";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature } from "@/lib/feature-gate";
import { toLocalDateStr, toLocalMonthStr } from "@/lib/date-utils";
import { isReadOnlyStoreTarget } from "@/lib/store-read-only";
export default async function BeautyPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    date?: string;
    month?: string;
    calendar?: string;
  }>;
}) {
  const u = await getCurrentUser();
  if (!u || !(await checkPermission(u.role, u.staffId, "booking.read")))
    redirect("/dashboard");
  const q = await searchParams,
    tab = tabs.find((t) => t === q.tab) ?? "首頁",
    a = await beautyManager("booking.read");
  const permission =
    tab === "顧客管理" || tab === "顧客經營"
      ? "customer.read"
      : tab === "營運"
        ? "transaction.read"
        : tab === "分析"
          ? "report.read"
          : tab === "技師管理"
            ? "staff.view"
            : tab === "收費方式"
              ? "plans.edit"
              : tab === "設定" || tab === "位置管理"
                ? "business_hours.view"
                : "booking.read";
  if (!(await checkPermission(u.role, u.staffId, permission)))
    redirect("/dashboard/beauty");
  const feature = (
    {
      顧客管理: FEATURES.CUSTOMER_MANAGEMENT,
      顧客經營: FEATURES.CUSTOMER_CARE,
      營運: FEATURES.TRANSACTION_MANAGEMENT,
      分析: FEATURES.BASIC_REPORTS,
      技師管理: FEATURES.STAFF_MANAGEMENT,
      服務項目: FEATURES.PLAN_MANAGEMENT,
      收費方式: FEATURES.PLAN_MANAGEMENT,
    } as Record<string, (typeof FEATURES)[keyof typeof FEATURES]>
  )[tab];
  if (feature) await requireStoreFeature(a.storeId, feature);
  const date =
      q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : toLocalDateStr(),
    month =
      q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month)
        ? q.month
        : toLocalMonthStr();
  const [data, store, view] = await Promise.all([
    beautyDashboard(
      date,
      month,
      q.calendar === "week" || q.calendar === "month" ? q.calendar : "day",
    ),
    prisma.store.findUniqueOrThrow({
      where: { id: a.storeId },
      select: { slug: true },
    }),
    resolveStoreViewContextFromCookie(u),
  ]);
  return (
    <PageShell>
      <PageHeader title={tab} />
      <BeautyDashboard
        key={`${a.storeId}:${tab}:${date}:${month}:${data.calendar}`}
        data={data}
        tab={tab}
        slug={store.slug}
        readOnly={!!view?.isViewMode || isReadOnlyStoreTarget(u, a.storeId)}
      />
    </PageShell>
  );
}
