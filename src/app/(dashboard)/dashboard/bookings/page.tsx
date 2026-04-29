import { getMonthBookingSummary } from "@/server/queries/booking";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { ServerTiming, withTiming } from "@/lib/perf";
import { getActiveStoreForRead } from "@/lib/store";
import { getCachedMonthScheduleSummary } from "@/lib/query-cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { FormSuccessToast } from "@/components/form-success-toast";
import { BookingsManager } from "./bookings-manager";

/**
 * 預約管理 — 桌機版（Phase 2 desktop family）
 *
 * PageShell + PageHeader 對齊 dashboard / customers / growth / revenue / reports。
 * 主體委由 BookingsManager（client）處理月曆 + 日明細 + booking detail drawer。
 */
interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) {
    redirect("/dashboard");
  }
  const params = await searchParams;

  const todayStr = toLocalDateStr();
  const [todayY, todayM] = todayStr.split("-").map(Number);
  const year = params.year ? parseInt(params.year) : todayY;
  const month = params.month ? parseInt(params.month) : todayM;

  const activeStoreId = await getActiveStoreForRead(user);
  const timer = new ServerTiming("/dashboard/bookings");
  const [monthData, monthSchedule, servicePlans] = await Promise.all([
    withTiming("getMonthBookingSummary", timer, () =>
      getMonthBookingSummary(year, month, activeStoreId),
    ),
    // 月份營業狀態摘要 — 讓月曆可分辨「沒預約」vs「沒營業」。
    // ADMIN 全店視角（無 activeStoreId）跨店無法匯總一份排班 → 給空表
    // 退化為「無法判斷」，UI 端會落到 generic 文案不會誤標公休。
    withTiming("monthSchedule", timer, () =>
      activeStoreId
        ? getCachedMonthScheduleSummary(activeStoreId, year, month)
        : Promise.resolve({}),
    ),
    withTiming("servicePlans", timer, () =>
      activeStoreId
        ? prisma.servicePlan.findMany({
            where: { storeId: activeStoreId, isActive: true },
            select: { id: true, name: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          })
        : Promise.resolve([]),
    ),
  ]);
  timer.finish();

  return (
    <PageShell>
      <FormSuccessToast />
      <PageHeader
        title="預約管理"
        subtitle={`${year} 年 ${month} 月`}
        actions={
          <Link
            href="/dashboard/bookings/new"
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700"
          >
            ＋ 新增預約
          </Link>
        }
      />
      <BookingsManager
        year={year}
        month={month}
        monthData={monthData}
        monthSchedule={monthSchedule}
        servicePlans={servicePlans}
      />
    </PageShell>
  );
}
