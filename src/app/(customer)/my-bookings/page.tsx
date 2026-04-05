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
  PACKAGE_SESSION: "套餐堂數",
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
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">&larr;</Link>
        <h1 className="text-xl font-bold text-earth-900">我的預約</h1>
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

      {/* Booking cards */}
      {displayed.length === 0 ? (
        <div className="py-12 text-center text-earth-400">
          {tab === "upcoming" ? (
            <>
              <div className="mb-2 text-3xl">📅</div>
              <p className="text-sm">尚無即將到來的預約</p>
              <Link
                href="/book/new"
                className="mt-3 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
              >
                立即預約
              </Link>
            </>
          ) : (
            <>
              <div className="mb-2 text-3xl">📋</div>
              <p className="text-sm">尚無歷史預約紀錄</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                b.bookingStatus === "CANCELLED" ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-earth-900">
                    {new Date(b.bookingDate).toLocaleDateString("zh-TW", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </p>
                  <p className="text-lg font-bold text-primary-700">{b.slotTime}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[b.bookingStatus]}`}>
                  {STATUS_LABEL[b.bookingStatus]}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-earth-500">
                <span>
                  類型：{BOOKING_TYPE_LABEL[b.bookingType] ?? b.bookingType}
                </span>
                <span>{b.people} 人</span>
                {b.isMakeup && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    補課
                  </span>
                )}
                {b.revenueStaff && (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: b.revenueStaff.colorCode }}
                    />
                    {b.revenueStaff.displayName}
                  </span>
                )}
              </div>

              {/* Cancel button for upcoming */}
              {(b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED") && (
                <div className="mt-3 border-t pt-3">
                  <Link
                    href={`/my-bookings/${b.id}/cancel`}
                    className="text-xs text-red-500 hover:underline"
                  >
                    取消此預約
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
