import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function CustomerHomePage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  // 查詢方案餘額（依人數扣堂）+ 最近預約 + 補課次數
  let remaining = 0;
  let nextBooking: { bookingDate: Date; slotTime: string } | null = null;
  let makeupCount = 0;

  try {
    const [wallets, upcoming, credits] = await Promise.all([
      // 取所有有效方案 + 關聯預約，用 people 加總算真實剩餘
      prisma.customerPlanWallet.findMany({
        where: { customerId: user.customerId, status: "ACTIVE" },
        select: {
          totalSessions: true,
          bookings: {
            where: { bookingStatus: { in: ["COMPLETED", "NO_SHOW", "CONFIRMED", "PENDING"] }, isMakeup: false },
            select: { bookingStatus: true, people: true },
          },
        },
      }),
      // 最近一次預約：未取消、未來日期、升冪取第一筆
      prisma.booking.findFirst({
        where: {
          customerId: user.customerId,
          bookingStatus: { in: ["CONFIRMED", "PENDING"] },
          bookingDate: { gte: new Date() },
        },
        select: { bookingDate: true, slotTime: true },
        orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
      }),
      prisma.makeupCredit.count({
        where: {
          customerId: user.customerId,
          isUsed: false,
          OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
        },
      }),
    ]);
    // 依 people 數加總計算真實剩餘可預約
    remaining = wallets.reduce((sum, w) => {
      const used = w.bookings
        .filter((b) => b.bookingStatus === "COMPLETED" || b.bookingStatus === "NO_SHOW")
        .reduce((s, b) => s + b.people, 0);
      const preDeducted = w.bookings
        .filter((b) => b.bookingStatus === "CONFIRMED" || b.bookingStatus === "PENDING")
        .reduce((s, b) => s + b.people, 0);
      return sum + (w.totalSessions - used - preDeducted);
    }, 0);
    nextBooking = upcoming;
    makeupCount = credits;
  } catch {
    // 資料庫查詢失敗時顯示空狀態，不讓整頁掛掉
  }

  return (
    <div>
      {/* 溫度區塊 */}
      <div className="mb-6 rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
        <p className="text-lg font-semibold text-earth-900">
          Hi, {user.name}
        </p>
        <div className="mt-2 space-y-1 text-sm text-earth-500">
          {remaining > 0 ? (
            <p>你目前還有 <strong className="text-primary-700">{remaining}</strong> 次療程</p>
          ) : (
            <p>你目前尚未購買方案</p>
          )}
          {makeupCount > 0 && (
            <p>可用補課：<strong className="text-amber-600">{makeupCount}</strong> 次</p>
          )}
          {nextBooking ? (
            <p>
              最近一次預約：{new Date(nextBooking.bookingDate).toLocaleDateString("zh-TW", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })} {nextBooking.slotTime}
            </p>
          ) : (
            <p>目前沒有即將到來的預約</p>
          )}
        </div>
        <p className="mt-3 text-sm text-earth-400">今天也來放鬆一下吧</p>
      </div>

      {/* 功能卡 */}
      <div className="grid gap-3">
        <Link
          href="/book/new"
          className="flex items-center gap-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-base font-bold text-primary-600">+</div>
          <div>
            <p className="font-semibold text-earth-900">新增預約</p>
            <p className="text-xs text-earth-500">選擇日期與時段</p>
          </div>
        </Link>

        <Link
          href="/my-bookings"
          className="flex items-center gap-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-base font-bold text-primary-600">=</div>
          <div>
            <p className="font-semibold text-earth-900">我的預約</p>
            <p className="text-xs text-earth-500">即將到來與歷史紀錄</p>
          </div>
        </Link>

        <Link
          href="/my-plans"
          className="flex items-center gap-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-base font-bold text-primary-600">#</div>
          <div>
            <p className="font-semibold text-earth-900">我的方案</p>
            <p className="text-xs text-earth-500">課程餘額與方案狀態</p>
          </div>
        </Link>

        <Link
          href="/profile"
          className="flex items-center gap-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-base font-bold text-primary-600">@</div>
          <div>
            <p className="font-semibold text-earth-900">我的資料</p>
            <p className="text-xs text-earth-500">基本資料與修改密碼</p>
          </div>
        </Link>

        <a
          href="https://health-tracker-eight-rosy.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-base font-bold text-primary-600">~</div>
          <div>
            <p className="font-semibold text-earth-900">身體指數</p>
            <p className="text-xs text-earth-500">將開啟健康管理系統（新分頁）</p>
          </div>
        </a>
      </div>
    </div>
  );
}
