import { getDayBookings } from "@/server/queries/booking";
import Link from "next/link";

const FIXED_SLOTS = ["10:00", "11:00", "14:00", "15:00", "16:00", "17:30", "18:30", "19:30"];
const CAPACITY = 6;

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待確認", CONFIRMED: "已確認", COMPLETED: "已完成",
  CANCELLED: "已取消", NO_SHOW: "未到",
};

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const date = params.date ?? today;

  // Nav dates
  const dateObj = new Date(date + "T12:00:00");
  const prevDate = new Date(dateObj); prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(dateObj); nextDate.setDate(nextDate.getDate() + 1);
  const prevStr = prevDate.toISOString().slice(0, 10);
  const nextStr = nextDate.toISOString().slice(0, 10);

  const bookings = await getDayBookings(date);

  // Group by slotTime
  const slotMap = new Map<string, typeof bookings>();
  for (const slot of FIXED_SLOTS) slotMap.set(slot, []);
  for (const b of bookings) {
    const arr = slotMap.get(b.slotTime);
    if (arr) arr.push(b);
    else slotMap.set(b.slotTime, [b]);
  }

  const weekDayLabel = ["日", "一", "二", "三", "四", "五", "六"][dateObj.getDay()];

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">預約排程</h1>
        <Link
          href={`/dashboard/customers`}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + 至顧客頁建立預約
        </Link>
      </div>

      {/* Date nav */}
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`?date=${prevStr}`}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          ←
        </Link>
        <form method="GET" className="flex items-center gap-2">
          <input
            name="date"
            type="date"
            defaultValue={date}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none"
          />
          <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
            跳轉
          </button>
        </form>
        <Link
          href={`?date=${nextStr}`}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          →
        </Link>
        <Link
          href={`?date=${today}`}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium hover:bg-gray-200"
        >
          今天
        </Link>
        <span className="text-sm text-gray-500">
          {date}（{weekDayLabel}）
        </span>
        <span className="text-xs text-gray-400">
          共 {bookings.filter(b => b.bookingStatus !== "CANCELLED").length} 筆有效預約
        </span>
      </div>

      {/* Schedule grid */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="w-20 px-4 py-3 text-left text-sm font-medium text-gray-600">時段</th>
              <th className="w-16 px-3 py-3 text-center text-sm font-medium text-gray-600">人數</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">預約</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {FIXED_SLOTS.map((slot) => {
              const slotBookings = slotMap.get(slot) ?? [];
              const activeCount = slotBookings.filter(
                (b) => b.bookingStatus !== "CANCELLED"
              ).length;
              const isFull = activeCount >= CAPACITY;
              const isNearFull = activeCount >= 4;

              return (
                <tr key={slot} className="hover:bg-gray-50">
                  {/* Time */}
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-lg px-3 py-1 text-sm font-bold ${
                      isFull
                        ? "bg-red-100 text-red-700"
                        : isNearFull
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-green-50 text-green-700"
                    }`}>
                      {slot}
                    </span>
                  </td>
                  {/* Count */}
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-semibold ${
                      isFull ? "text-red-600" : isNearFull ? "text-yellow-600" : "text-green-600"
                    }`}>
                      {activeCount}
                    </span>
                    <span className="text-xs text-gray-400">/{CAPACITY}</span>
                  </td>
                  {/* Booking cards */}
                  <td className="px-4 py-2">
                    {slotBookings.length === 0 ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {slotBookings.map((b) => (
                          <Link
                            key={b.id}
                            href={`/dashboard/bookings/${b.id}`}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:shadow-sm transition-shadow ${
                              b.bookingStatus === "CANCELLED"
                                ? "border-dashed border-gray-200 opacity-50"
                                : b.bookingStatus === "COMPLETED"
                                ? "border-green-200 bg-green-50"
                                : b.bookingStatus === "NO_SHOW"
                                ? "border-red-200 bg-red-50"
                                : "border-gray-200 bg-white"
                            }`}
                          >
                            {/* Staff color dot */}
                            <span
                              className="h-2 w-2 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: b.revenueStaff.colorCode }}
                            />
                            <span className="font-medium text-gray-900">{b.customer.name}</span>
                            <span className="text-gray-400">{b.revenueStaff.displayName}</span>
                            <span className={`rounded px-1 py-0.5 text-xs ${
                              b.bookingStatus === "COMPLETED" ? "bg-green-200 text-green-800" :
                              b.bookingStatus === "CANCELLED" ? "bg-gray-100 text-gray-500" :
                              b.bookingStatus === "NO_SHOW" ? "bg-red-200 text-red-700" :
                              b.bookingStatus === "CONFIRMED" ? "bg-blue-100 text-blue-700" :
                              "bg-yellow-100 text-yellow-700"
                            }`}>
                              {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-green-100" />空位充足</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-yellow-100" />接近額滿（≥4）</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-100" />已額滿</span>
      </div>
    </div>
  );
}
