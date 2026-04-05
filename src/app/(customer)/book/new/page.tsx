import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookingCalendarView } from "./booking-calendar-view";

export default async function NewBookingPage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  // ⚡ 只查必要欄位：selfBookingEnabled + wallet 摘要
  const customer = await prisma.customer.findUnique({
    where: { id: user.customerId },
    select: {
      selfBookingEnabled: true,
      planWallets: {
        where: { status: "ACTIVE", remainingSessions: { gt: 0 } },
        select: {
          id: true,
          remainingSessions: true,
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!customer) redirect("/");

  const hasValidWallet =
    customer.selfBookingEnabled && customer.planWallets.length > 0;

  if (!hasValidWallet) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-3">
          <Link href="/book" className="text-earth-400 hover:text-earth-600">
            &larr;
          </Link>
          <h1 className="text-xl font-bold text-earth-900">新增預約</h1>
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-8 text-center shadow-sm">
          <h2 className="mb-2 text-base font-semibold text-earth-800">
            尚未開放自助預約
          </h2>
          <p className="text-sm text-earth-500">
            請聯繫您的直屬店長，協助安排預約或購買課程方案。
          </p>
        </div>
      </div>
    );
  }

  // ⚡ 並行查詢：未來預約數 + wallet 總堂數（已在上面查到）
  const totalRemaining = customer.planWallets.reduce(
    (s, w) => s + w.remainingSessions,
    0
  );

  const futureBookingCount = await prisma.booking.count({
    where: {
      customerId: user.customerId,
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      bookingDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });

  const remainingQuota = Math.max(0, totalRemaining - futureBookingCount);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">新增預約</h1>
      </div>

      {/* 剩餘配額 */}
      <div className="mb-4 rounded-lg bg-primary-50 px-4 py-3 text-sm">
        <span className="text-primary-700">
          剩餘可預約：<strong className="text-lg">{remainingQuota}</strong> 堂
        </span>
        <span className="ml-3 text-xs text-primary-400">
          ���已有 {futureBookingCount} 筆未完成，課程剩餘 {totalRemaining} 堂）
        </span>
      </div>

      {remainingQuota <= 0 ? (
        <div className="rounded-xl border bg-yellow-50 p-4 text-sm text-yellow-700">
          預約已達課程剩餘堂數上限，請完成已預約的課程後再繼續預約。
        </div>
      ) : (
        <BookingCalendarView
          customerId={user.customerId}
          activeWallets={customer.planWallets.map((w) => ({
            id: w.id,
            planName: w.plan.name,
            remainingSessions: w.remainingSessions,
          }))}
        />
      )}
    </div>
  );
}
