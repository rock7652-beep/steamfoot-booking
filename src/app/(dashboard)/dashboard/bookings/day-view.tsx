"use client";

import Link from "next/link";

const FIXED_SLOTS = ["10:00", "11:00", "14:00", "15:00", "16:00", "17:30", "18:30", "19:30"];
const CAPACITY = 6;
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待確認",
  CONFIRMED: "已確認",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  NO_SHOW: "未到",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 border-yellow-200",
  CONFIRMED: "bg-blue-100 text-blue-700 border-blue-200",
  COMPLETED: "bg-green-100 text-green-700 border-green-200",
  CANCELLED: "bg-gray-100 text-gray-500 border-gray-200 border-dashed opacity-50",
  NO_SHOW: "bg-red-100 text-red-700 border-red-200",
};

interface DayBooking {
  id: string;
  slotTime: string;
  bookingStatus: string;
  customer: { name: string; phone: string };
  revenueStaff: { id: string; displayName: string; colorCode: string };
  serviceStaff: { id: string; displayName: string } | null;
  servicePlan: { name: string } | null;
}

interface DayViewProps {
  date: string;
  bookings: DayBooking[];
}

export function DayView({ date, bookings }: DayViewProps) {
  const dateObj = new Date(date + "T12:00:00");
  const dayLabel = WEEKDAY_LABELS[dateObj.getDay()];
  const displayDate = dateObj.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });

  // Calculate prev and next dates
  const prevDate = new Date(dateObj);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);

  const nextDate = new Date(dateObj);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  // Group bookings by slot
  const slotMap = new Map<string, DayBooking[]>();
  for (const slot of FIXED_SLOTS) {
    slotMap.set(slot, []);
  }
  for (const booking of bookings) {
    const arr = slotMap.get(booking.slotTime);
    if (arr) {
      arr.push(booking);
    }
  }

  // Get all staff for legend
  const staffSet = new Set<string>();
  const staffColorMap = new Map<string, string>();
  for (const booking of bookings) {
    staffSet.add(booking.revenueStaff.displayName);
    staffColorMap.set(booking.revenueStaff.displayName, booking.revenueStaff.colorCode);
  }
  const staffList = Array.from(staffSet);

  const activeBookingCount = bookings.filter((b) => b.bookingStatus !== "CANCELLED").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {displayDate}（{dayLabel}）
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            共 {activeBookingCount} 筆有效預約
          </p>
        </div>
        <Link
          href="/dashboard/bookings"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 w-fit"
        >
          ← 返回月曆
        </Link>
      </div>

      {/* Day Navigation */}
      <div className="flex items-center gap-2">
        <Link
          href={`?view=day&date=${prevDateStr}`}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          ← 前一天
        </Link>
        <Link
          href={`?view=day&date=${nextDateStr}`}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          後一天 →
        </Link>
      </div>

      {/* Staff Color Legend */}
      {staffList.length > 0 && (
        <div className="flex flex-wrap gap-3 rounded-lg bg-gray-50 p-3">
          {staffList.map((staffName) => (
            <div key={staffName} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: staffColorMap.get(staffName) }}
              />
              <span className="text-xs font-medium text-gray-700">{staffName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Time Slots */}
      <div className="space-y-2 sm:space-y-3">
        {FIXED_SLOTS.map((slot) => {
          const slotBookings = slotMap.get(slot) || [];
          const activeCount = slotBookings.filter((b) => b.bookingStatus !== "CANCELLED").length;
          const isFull = activeCount >= CAPACITY;
          const isNearFull = activeCount >= 4;

          return (
            <div key={slot} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
              {/* Time header */}
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={`inline-block rounded-lg px-3 py-1 text-sm font-bold ${
                    isFull
                      ? "bg-red-100 text-red-700"
                      : isNearFull
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  {slot}
                </span>
                <span className="text-xs text-gray-500">
                  <span
                    className={`font-semibold ${
                      isFull ? "text-red-600" : isNearFull ? "text-yellow-600" : "text-green-600"
                    }`}
                  >
                    {activeCount}
                  </span>
                  <span className="text-gray-400">/{CAPACITY}</span>
                </span>
              </div>

              {/* Booking cards */}
              {slotBookings.length === 0 ? (
                <p className="text-xs text-gray-300">暫無預約</p>
              ) : (
                <div className="space-y-2">
                  {slotBookings.map((booking) => (
                    <Link
                      key={booking.id}
                      href={`/dashboard/bookings/${booking.id}`}
                      className={`block rounded-lg border p-2.5 transition-shadow hover:shadow-md sm:p-3 ${
                        STATUS_COLORS[booking.bookingStatus] || "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Staff color dot */}
                        <div
                          className="mt-0.5 h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: booking.revenueStaff.colorCode }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-semibold text-gray-900">
                              {booking.customer.name}
                            </p>
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                                STATUS_COLORS[booking.bookingStatus] || "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {STATUS_LABEL[booking.bookingStatus] || booking.bookingStatus}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {booking.revenueStaff.displayName}
                            {booking.serviceStaff && booking.serviceStaff.displayName !== booking.revenueStaff.displayName
                              ? ` / ${booking.serviceStaff.displayName}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
