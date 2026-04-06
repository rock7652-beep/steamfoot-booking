import { getCurrentUser } from "@/lib/session";
import { listBookings } from "@/server/queries/booking";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { BookingStatus } from "@prisma/client";

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "待確認",
  CONFIRMED: "已確認",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  NO_SHOW: "未到",
};

const STATUS_COLOR: Record<BookingStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  NO_SHOW: "bg-red-100 text-red-600",
};

const BOOKING_TYPE_LABEL: Record<string, string> = {
  FIRST_TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE_SESSION: "課程堂數",
};

interface PageProps {
  searchParams: Promise<{ tab?: "upcoming" | "history" }>;
}

export default async function MyBookingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const tab = params.tab ?? "upcoming";

  // 取顧客所有預約（最新 50 筆）
  const { bookings } = await listBookings({ pageSize: 50 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = bookings.filter(
    (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED"
  );
  const history = bookings.filter(
    (b) => b.bookingStatus !== "PENDING" && b.bookingStatus !== "CONFIRMED"
  );

  const displayed = tab === "upcoming" ? upcoming : history;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">&larr;</Link>
          <h1 className="text-xl font-bold text-earth-900">我的預約</h1>
        </div>
        <Link
          href="/book/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 transition"
        >
          <span>＋</span>
          新增預約
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-earth-200">
        <Link
          href="?tab=upcoming"
          className={`px-4 py-2 text-sm font-medium ${
            tab === "upcoming"
              ? "border-b-2 border-primary-600 text-primary-600"
              : "text-earth-500 hover:text-earth-700"
          }`}
        >
          即將到來
          {upcoming.length > 0 && (
            <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 py-0.5 text-xs text-primary-700">
              {upcoming.length}
            </span>
          )}
        </Link>
        <Link
          href="?tab=history"
          className={`px-4 py-2 text-sm font-medium ${
            tab === "history"
              ? "border-b-2 border-primary-600 text-primary-600"
              : "text-earth-500 hover:text-earth-700"
          }`}
        >
          歷史紀錄
        </Link>
      </div>

      {/* Booking list */}
      {displayed.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {tab === "upcoming" ? (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-400"><path d="M6.75 3v2.25M17.25 3v2.25" /><path d="M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
              </div>
              <p className="text-sm font-medium text-earth-700">還沒有預約</p>
              <p className="mt-1 text-xs text-earth-400">選擇一個時段，開始你的療程吧</p>
              <Link
                href="/book/new"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4.5v15m7.5-7.5h-15" /></svg>
                預約第一堂
              </Link>
            </>
          ) : (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-earth-100">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-earth-400"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-sm font-medium text-earth-700">尚無歷史紀錄</p>
              <p className="mt-1 text-xs text-earth-400">完成的預約會顯示在這裡</p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-earth-200 bg-white overflow-hidden">
          {displayed.map((b, idx) => (
            <div
              key={b.id}
              className={`px-4 py-2.5 ${
                idx > 0 ? "border-t border-earth-100" : ""
              } ${b.bookingStatus === "CANCELLED" ? "opacity-50" : ""}`}
            >
              {/* Single compact row */}
              <div className="flex items-center gap-3">
                {/* Date + time */}
                <div className="flex-shrink-0">
                  <span className="text-sm font-medium text-earth-900">
                    {new Date(b.bookingDate).toLocaleDateString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </span>
                  <span className="ml-1.5 text-sm font-bold text-primary-700">{b.slotTime}</span>
                </div>

                {/* Info tags */}
                <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-earth-500 min-w-0">
                  {b.people > 1 && <span>{b.people}位</span>}
                  <span className="text-earth-300">·</span>
                  <span className="truncate">{BOOKING_TYPE_LABEL[b.bookingType] ?? b.bookingType}</span>
                  {b.isMakeup && (
                    <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">
                      補課
                    </span>
                  )}
                  {b.revenueStaff && (
                    <span className="hidden sm:flex items-center gap-1">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: b.revenueStaff.colorCode }}
                      />
                      <span className="text-[11px]">{b.revenueStaff.displayName}</span>
                    </span>
                  )}
                </div>

                {/* Status + action */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[b.bookingStatus]}`}>
                    {STATUS_LABEL[b.bookingStatus]}
                  </span>
                  {(b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED") && (
                    <Link
                      href={`/my-bookings/${b.id}/cancel`}
                      className="text-[11px] text-red-400 hover:text-red-600 hover:underline"
                    >
                      取消
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
