import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

/** 計算距離提醒文案 */
function getReminderText(bookingDate: Date, slotTime: string): string {
  const now = new Date();
  const [h, m] = slotTime.split(":").map(Number);
  const target = new Date(bookingDate);
  target.setHours(h, m, 0, 0);

  const diffMs = target.getTime() - now.getTime();
  if (diffMs < 0) return "";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0 && diffHours <= 3) return `${diffHours} 小時後就到了，準備出發吧`;
  if (diffDays === 0) return `今天 ${slotTime}，記得來喔`;
  if (diffDays === 1) return `明天 ${slotTime}，記得來喔`;
  if (diffDays === 2) return `後天 ${slotTime}，別忘了`;
  if (diffDays <= 7) return `${diffDays} 天後，期待你的到來`;
  return "";
}

export default async function CustomerHomePage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  // 查詢方案餘額（依人數扣堂）+ 最近預約 + 補課次數
  let remaining = 0;
  let nextBooking: { bookingDate: Date; slotTime: string } | null = null;
  let makeupCount = 0;

  try {
    const [wallets, upcoming, credits] = await Promise.all([
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

  const reminderText = nextBooking ? getReminderText(nextBooking.bookingDate, nextBooking.slotTime) : "";

  return (
    <div className="space-y-5">
      {/* ── Hero greeting + CTA ── */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <p className="text-lg font-semibold text-earth-900">
          Hi, {user.name}
        </p>

        {/* 預約提醒區塊 */}
        {nextBooking ? (
          <div className="mt-3 rounded-xl bg-primary-50/70 px-4 py-3">
            <p className="text-sm font-medium text-primary-800">
              最近一次預約：{new Date(nextBooking.bookingDate).toLocaleDateString("zh-TW", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })} {nextBooking.slotTime}
            </p>
            {reminderText && (
              <p className="mt-0.5 text-xs text-primary-600">{reminderText}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-earth-400">目前沒有即將到來的預約</p>
        )}

        {/* 數據摘要 */}
        <div className="mt-3 flex items-center gap-4 text-sm text-earth-500">
          {remaining > 0 ? (
            <span>剩餘可預約 <strong className="text-primary-700">{remaining}</strong> 堂</span>
          ) : (
            <span>尚未購買方案</span>
          )}
          {makeupCount > 0 && (
            <span>補課 <strong className="text-amber-600">{makeupCount}</strong> 次</span>
          )}
        </div>

        {/* 主 CTA */}
        <Link
          href="/book/new"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4.5v15m7.5-7.5h-15" /></svg>
          立即預約下一次
        </Link>
      </div>

      {/* ── 功能導覽 ── */}
      <div className="grid gap-2">
        <Link
          href="/my-bookings"
          className="flex items-center gap-3.5 rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600"><path d="M6.75 3v2.25M17.25 3v2.25" /><path d="M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-earth-800">我的預約</p>
            <p className="text-xs text-earth-400">即將到來與歷史紀錄</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-300"><path d="M9 5l7 7-7 7" /></svg>
        </Link>

        <Link
          href="/my-plans"
          className="flex items-center gap-3.5 rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600"><path d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6z" /><path d="M21 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6" /></svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-earth-800">我的方案</p>
            <p className="text-xs text-earth-400">課程餘額與使用紀錄</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-300"><path d="M9 5l7 7-7 7" /></svg>
        </Link>

        <Link
          href="/profile"
          className="flex items-center gap-3.5 rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600"><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /><path d="M4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-earth-800">我的資料</p>
            <p className="text-xs text-earth-400">基本資料與修改密碼</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-300"><path d="M9 5l7 7-7 7" /></svg>
        </Link>

        <a
          href="https://health-tracker-eight-rosy.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3.5 rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600"><path d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5" /><path d="M7.5 16.5L21 3m0 0h-5.25M21 3v5.25" /></svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-earth-800">身體指數</p>
            <p className="text-xs text-earth-400">開啟健康管理系統</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-300"><path d="M9 5l7 7-7 7" /></svg>
        </a>
      </div>
    </div>
  );
}
