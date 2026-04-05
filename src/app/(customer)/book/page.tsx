import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function CustomerHomePage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  // 查詢方案餘額 + 最近預約（輕量 select）
  const [walletData, lastBooking] = await Promise.all([
    prisma.customerPlanWallet.aggregate({
      where: { customerId: user.customerId, status: "ACTIVE", remainingSessions: { gt: 0 } },
      _sum: { remainingSessions: true },
    }),
    prisma.booking.findFirst({
      where: { customerId: user.customerId, bookingStatus: { in: ["COMPLETED", "CONFIRMED", "PENDING"] } },
      select: { bookingDate: true, slotTime: true },
      orderBy: { bookingDate: "desc" },
    }),
  ]);

  const remaining = walletData._sum.remainingSessions ?? 0;

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
          {lastBooking ? (
            <p>
              上次預約：{new Date(lastBooking.bookingDate).toLocaleDateString("zh-TW", {
                month: "long",
                day: "numeric",
              })} {lastBooking.slotTime}
            </p>
          ) : (
            <p>你還沒有預約紀錄</p>
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
