import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { bookingDateToday } from "@/lib/date-utils";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { DataTable, TH, TD, TR } from "@/components/admin/data-table";
import { StatusBadge, bookingStatusMeta } from "@/components/admin/status-badge";
import { EmptyStateCompact } from "@/components/admin/empty-state-compact";

interface TodayScheduleProps {
  activeStoreId: string | null;
}

export async function TodaySchedule({ activeStoreId }: TodayScheduleProps) {
  const user = await getCurrentUser();
  if (!user) return null;
  const storeFilter = getStoreFilter(user, activeStoreId);

  const bookings = await prisma.booking
    .findMany({
      where: {
        bookingDate: bookingDateToday(),
        bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...storeFilter,
      },
      include: {
        customer: { select: { name: true, phone: true } },
        revenueStaff: { select: { displayName: true, colorCode: true } },
        servicePlan: { select: { name: true, price: true, sessionCount: true } },
      },
      orderBy: { slotTime: "asc" },
      take: 8,
    })
    .catch(() => []);

  return (
    <section className="flex h-full flex-col rounded-lg border border-earth-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-earth-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-earth-900">今日預約</h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-earth-100 px-1.5 text-xs font-semibold tabular-nums text-earth-700">
            {bookings.length}
          </span>
        </div>
        <Link
          href="/dashboard/bookings"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          查看全部 →
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="flex-1 p-4">
          <EmptyStateCompact
            title="今日沒有預約"
            hint="客人預約時會顯示在這裡"
            cta={
              <Link
                href="/dashboard/bookings/new"
                className="inline-flex h-8 items-center rounded-md bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
              >
                ＋ 新增預約
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="hidden md:block">
            <DataTable>
              <thead>
                <tr>
                  <TH className="w-20">時間</TH>
                  <TH>顧客</TH>
                  <TH>項目</TH>
                  <TH className="w-24">教練</TH>
                  <TH className="w-24">狀態</TH>
                  <TH align="right" className="w-24">金額</TH>
                  <TH align="right" className="w-20">操作</TH>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const meta = bookingStatusMeta(
                    b.bookingStatus as string,
                    b.isCheckedIn,
                  );
                  const people = b.people > 1 ? ` ×${b.people}` : "";
                  return (
                    <TR key={b.id}>
                      <TD className="font-semibold text-earth-900 tabular-nums">
                        {b.slotTime}
                      </TD>
                      <TD>
                        <div className="truncate">
                          {b.customer?.name ?? "（無名）"}
                          {people && (
                            <span className="ml-1 text-xs text-earth-400">{people}</span>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <span className="truncate text-earth-700">
                          {b.servicePlan?.name ?? (b.isMakeup ? "補課" : "—")}
                        </span>
                      </TD>
                      <TD>
                        <span className="truncate text-earth-600">
                          {b.revenueStaff?.displayName ?? "未指派"}
                        </span>
                      </TD>
                      <TD>
                        <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                      </TD>
                      <TD number>
                        <BookingAmount
                          isMakeup={b.isMakeup}
                          bookingType={b.bookingType as string}
                          plan={b.servicePlan}
                        />
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/dashboard/bookings/${b.id}`}
                          className="text-sm text-primary-600 hover:text-primary-700"
                        >
                          查看 →
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </DataTable>
          </div>

          {/* Mobile: card list */}
          <div className="divide-y divide-earth-100 md:hidden">
            {bookings.map((b) => {
              const meta = bookingStatusMeta(
                b.bookingStatus as string,
                b.isCheckedIn,
              );
              return (
                <Link
                  key={b.id}
                  href={`/dashboard/bookings/${b.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-earth-50"
                >
                  <div className="flex-shrink-0 w-14 text-center">
                    <div className="text-sm font-semibold text-earth-900 tabular-nums">
                      {b.slotTime}
                    </div>
                    {b.people > 1 && (
                      <div className="text-xs text-earth-500">×{b.people}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-earth-900">
                        {b.customer?.name ?? "（無名）"}
                      </span>
                      <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-earth-500">
                      {b.servicePlan?.name ?? (b.isMakeup ? "補課" : "—")}
                      {b.revenueStaff?.displayName && ` · ${b.revenueStaff.displayName}`}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-earth-300">›</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function BookingAmount({
  isMakeup,
  bookingType,
  plan,
}: {
  isMakeup: boolean;
  bookingType: string;
  plan: { price: unknown; sessionCount: number } | null;
}) {
  if (isMakeup) {
    return <span className="text-xs text-earth-400">補課</span>;
  }
  if (!plan) {
    return <span className="text-earth-400">—</span>;
  }
  const planPrice = Number(plan.price ?? 0);
  if (!planPrice) {
    return <span className="text-earth-400">—</span>;
  }
  if (bookingType === "PACKAGE_SESSION" && plan.sessionCount > 1) {
    const perSession = Math.round(planPrice / plan.sessionCount);
    return (
      <span className="text-earth-600" title={`方案定價 NT$ ${planPrice.toLocaleString()} / ${plan.sessionCount} 堂`}>
        <span className="text-xs text-earth-400">≈ </span>
        NT$ {perSession.toLocaleString()}
      </span>
    );
  }
  return <span className="text-earth-700">NT$ {planPrice.toLocaleString()}</span>;
}

export function TodayScheduleSkeleton() {
  return (
    <div className="rounded-lg border border-earth-200 bg-white">
      <div className="flex items-center justify-between border-b border-earth-100 px-4 py-3">
        <div className="h-5 w-24 rounded bg-earth-100" />
        <div className="h-4 w-20 rounded bg-earth-100" />
      </div>
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-earth-50" />
        ))}
      </div>
    </div>
  );
}
