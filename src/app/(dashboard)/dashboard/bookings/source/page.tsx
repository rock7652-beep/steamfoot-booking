import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { dayRange, formatTWTime, toLocalDateStr } from "@/lib/date-utils";
import { STATUS_LABEL } from "@/lib/booking-constants";
import { TRIAL_BOOKING_SOURCES, TRIAL_BOOKING_SOURCE_LABELS, type TrialBookingSource } from "@/lib/trial-booking-source";
import { DashboardLink } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";

interface Props {
  searchParams: Promise<{ source?: string; startDate?: string; endDate?: string; page?: string }>;
}

export default async function TrialSourceBookingsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) {
    redirect("/dashboard");
  }
  const params = await searchParams;
  const storeId = storeIdForViewContext(
    await getActiveStoreForRead(user),
    await resolveStoreViewContextFromCookie(user),
  );
  const source = TRIAL_BOOKING_SOURCES.find((value) => value === params.source) as TrialBookingSource | undefined;
  const today = toLocalDateStr();
  const monthStart = `${today.slice(0, 7)}-01`;
  const validDate = (date: string | undefined): date is string =>
    !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
  const startDate = validDate(params.startDate) ? params.startDate : monthStart;
  const endDate = validDate(params.endDate) && params.endDate >= startDate ? params.endDate : today;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? "1", 10) || 1));
  const pageSize = 30;
  const sourceFilter = source === "OTHER"
    ? { OR: [{ bookingSource: null }, { bookingSource: { notIn: [...TRIAL_BOOKING_SOURCES] } }, { bookingSource: "OTHER" }] }
    : { bookingSource: source };
  const where = {
    storeId: storeId ?? "__no_store__",
    bookingType: "FIRST_TRIAL" as const,
    createdAt: { gte: dayRange(startDate).start, lte: dayRange(endDate).end },
    ...sourceFilter,
  };
  const [bookings, total] = storeId && source
    ? await Promise.all([
        prisma.booking.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true, createdAt: true, bookingDate: true, bookingStatus: true,
            people: true, attendedPeople: true,
            customer: { select: { name: true } },
          },
        }),
        prisma.booking.count({ where }),
      ])
    : [[], 0];

  const hrefForPage = (target: number) =>
    `/dashboard/bookings/source?source=${source}&startDate=${startDate}&endDate=${endDate}&page=${target}`;

  return (
    <PageShell>
      <PageHeader title="體驗來源預約" subtitle={source ? `${TRIAL_BOOKING_SOURCE_LABELS[source]} · ${startDate} 至 ${endDate}` : "請從分析頁選擇來源"} />
      <DashboardLink href={`/dashboard/reports?startDate=${startDate}&endDate=${endDate}`} className="text-sm text-primary-700">← 返回分析</DashboardLink>
      {!storeId ? <p className="mt-4 text-sm text-earth-500">請先選擇店舖。</p> : !source ? (
        <p className="mt-4 text-sm text-earth-500">請從分析頁選擇來源。</p>
      ) : (
        <section className="mt-4 rounded-xl border border-earth-200 bg-white p-3">
          <p className="mb-3 text-xs text-earth-500">本期共 {total} 組；按預約建立日期篩選。點一筆預約可開啟原本的預約明細。</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-earth-100 text-xs text-earth-500"><tr>
                <th className="py-2 pr-3">建立時間</th><th className="px-3 py-2">體驗日期</th>
                <th className="px-3 py-2">顧客</th><th className="px-3 py-2">狀態</th>
                <th className="px-3 py-2 text-right">預約／完成</th><th className="pl-3 py-2 text-right">明細</th>
              </tr></thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id} className="border-b border-earth-50">
                    <td className="py-2 pr-3">{formatTWTime(booking.createdAt)}</td>
                    <td className="px-3 py-2">{booking.bookingDate.toISOString().slice(0, 10)}</td>
                    <td className="px-3 py-2">{booking.customer.name}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[booking.bookingStatus] ?? booking.bookingStatus}</td>
                    <td className="px-3 py-2 text-right">{booking.people}／{booking.bookingStatus === "COMPLETED" ? booking.attendedPeople ?? booking.people : 0}</td>
                    <td className="pl-3 py-2 text-right"><DashboardLink href={`/dashboard/bookings?bookingId=${booking.id}`} className="text-primary-700">查看預約 →</DashboardLink></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bookings.length === 0 && <p className="py-6 text-center text-sm text-earth-500">這個期間沒有此來源的體驗預約。</p>}
          <div className="mt-3 flex justify-end gap-3 text-sm">
            {page > 1 && <DashboardLink href={hrefForPage(page - 1)} className="text-primary-700">上一頁</DashboardLink>}
            {page * pageSize < total && <DashboardLink href={hrefForPage(page + 1)} className="text-primary-700">下一頁</DashboardLink>}
          </div>
        </section>
      )}
    </PageShell>
  );
}
