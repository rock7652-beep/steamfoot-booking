import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listAvailableSlots } from "@/server/queries/booking";
import { BookingForm } from "../booking-form";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MonthCalendar } from "./month-calendar";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function NewBookingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const customer = await prisma.customer.findUnique({
    where: { id: user.customerId },
    include: {
      planWallets: {
        where: { status: "ACTIVE" },
        include: { plan: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!customer) redirect("/");

  const hasValidWallet =
    customer.selfBookingEnabled &&
    customer.planWallets.some((w) => w.remainingSessions > 0);

  const today = new Date().toISOString().slice(0, 10);
  const selectedDate = params.date ?? today;

  // 計算未來有效預約數
  const futureBookingCount = hasValidWallet
    ? await prisma.booking.count({
        where: {
          customerId: user.customerId,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          bookingDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      })
    : 0;

  const totalRemaining = customer.planWallets.reduce(
    (s, w) => s + w.remainingSessions,
    0
  );
  const remainingQuota = Math.max(0, totalRemaining - futureBookingCount);

  // 取當天可用時段
  const dayAvail = hasValidWallet ? await listAvailableSlots(selectedDate) : null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">新增預約</h1>
      </div>

      {/* 未購課 */}
      {!hasValidWallet && (
        <div className="rounded-xl border border-earth-200 bg-white p-8 text-center shadow-sm">
          <h2 className="mb-2 text-base font-semibold text-earth-800">
            尚未開放自助預約
          </h2>
          <p className="text-sm text-earth-500">
            請聯繫您的直屬店長，協助安排預約或購買課程方案。
          </p>
        </div>
      )}

      {/* 可預約 */}
      {hasValidWallet && (
        <>
          {/* 剩餘配額 */}
          <div className="mb-4 rounded-lg bg-primary-50 px-4 py-3 text-sm">
            <span className="text-primary-700">
              剩餘可預約：<strong className="text-lg">{remainingQuota}</strong> 堂
            </span>
            <span className="ml-3 text-xs text-primary-400">
              （已有 {futureBookingCount} 筆未完成，課程剩餘 {totalRemaining} 堂）
            </span>
          </div>

          {remainingQuota <= 0 ? (
            <div className="rounded-xl border bg-yellow-50 p-4 text-sm text-yellow-700">
              預約已達課程剩餘堂數上限，請完成已預約的課程後再繼續預約。
            </div>
          ) : (
            <>
              {/* 月曆 */}
              <MonthCalendar selectedDate={selectedDate} />

              {/* 時段選擇 */}
              {dayAvail && (
                <BookingForm
                  customerId={user.customerId}
                  selectedDate={selectedDate}
                  slots={dayAvail.slots}
                  activeWallets={customer.planWallets.map((w) => ({
                    id: w.id,
                    planName: w.plan.name,
                    remainingSessions: w.remainingSessions,
                  }))}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
