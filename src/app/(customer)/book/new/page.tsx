import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { BookingCalendarView } from "./booking-calendar-view";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import { NoPlanEmptyState } from "@/components/no-plan-empty-state";

export default async function NewBookingPage() {
  const user = await getCurrentUser();
  // stale session / 沒有 customerId 時顯示 empty state，不 redirect
  if (!user || !user.customerId) {
    return <NoPlanEmptyState title="新增預約" />;
  }

  const [customer, makeupCredits] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: user.customerId },
      select: {
        selfBookingEnabled: true,
        planWallets: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            totalSessions: true,
            remainingSessions: true,
            expiryDate: true,
            plan: { select: { name: true } },
            bookings: {
              where: { isMakeup: false },
              select: { people: true, bookingStatus: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.makeupCredit.findMany({
      where: {
        customerId: user.customerId,
        isUsed: false,
        OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
      },
      select: {
        id: true,
        expiredAt: true,
        originalBooking: {
          select: { bookingDate: true, slotTime: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!customer) return <NoPlanEmptyState title="新增預約" />;

  // 新扣堂模型：remainingSessions = 購買 - COMPLETED - NO_SHOW(DEDUCTED)
  // 可預約 = remainingSessions - count(PENDING 非補課)
  const walletsWithRemaining = customer.planWallets.map((w) => {
    const pendingCount = w.bookings
      .filter((b) => (PENDING_STATUSES as readonly string[]).includes(b.bookingStatus))
      .length;
    return { ...w, computedRemaining: Math.max(0, w.remainingSessions - pendingCount) };
  });
  const activeWallets = walletsWithRemaining.filter((w) => w.computedRemaining > 0);

  const hasValidWallet =
    customer.selfBookingEnabled && (activeWallets.length > 0 || makeupCredits.length > 0);

  if (!hasValidWallet) {
    return <NoPlanEmptyState title="新增預約" />;
  }

  // 新模型：computedRemaining 已減去待到店預約數
  const totalRemaining = activeWallets.reduce(
    (s, w) => s + w.computedRemaining,
    0
  );
  const remainingQuota = Math.max(0, totalRemaining);

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Link href="/book" className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold text-earth-900">新增預約</h1>
      </div>

      {/* 剩餘配額 */}
      <div className="mb-5 rounded-xl bg-primary-50 px-5 py-4 text-base">
        <div className="text-primary-800">
          剩餘可預約：<strong className="text-xl">{remainingQuota}</strong> 堂
        </div>
        {makeupCredits.length > 0 && (
          <div className="mt-2 text-amber-800">
            可用補課：<strong>{makeupCredits.length}</strong> 次（不扣堂）
          </div>
        )}
      </div>

      {remainingQuota <= 0 && makeupCredits.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-50">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /><path d="M12 15.75h.008v.008H12v-.008z" /></svg>
          </div>
          <p className="text-lg font-semibold text-earth-900">預約已達堂數上限</p>
          <p className="mt-2 text-base text-earth-700">請先完成已預約的課程，再繼續預約新時段</p>
          <Link
            href="/my-bookings"
            className="mt-5 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-primary-600 px-6 text-base font-semibold text-white transition hover:bg-primary-700"
          >
            查看我的預約
          </Link>
        </div>
      ) : (
        <BookingCalendarView
          customerId={user.customerId}
          activeWallets={activeWallets.map((w) => ({
            id: w.id,
            planName: w.plan.name,
            remainingSessions: w.computedRemaining,
            expiryDate: w.expiryDate?.toISOString().slice(0, 10) ?? null,
          }))}
          makeupCredits={makeupCredits.map((c) => ({
            id: c.id,
            originalDate: c.originalBooking.bookingDate.toISOString().slice(0, 10),
            originalSlot: c.originalBooking.slotTime,
            expiredAt: c.expiredAt?.toISOString() ?? null,
          }))}
        />
      )}
    </div>
  );
}
