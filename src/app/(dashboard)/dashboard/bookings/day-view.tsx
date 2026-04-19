"use client";

import { DashboardLink as Link } from "@/components/dashboard-link";
import type { SlotAvailability } from "@/types";
import { EmptyState } from "@/components/ui/empty-state";
import { BookingQuickActions } from "../booking-quick-actions";

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
  CANCELLED: "bg-earth-100 text-earth-500 border-earth-200 border-dashed opacity-50",
  NO_SHOW: "bg-red-100 text-red-700 border-red-200",
};

interface DayBooking {
  id: string;
  slotTime: string;
  people: number;
  isMakeup: boolean;
  isCheckedIn: boolean;
  bookingStatus: string;
  customer: { name: string; phone: string; assignedStaff?: { displayName: string; colorCode: string } | null };
  revenueStaff: { id: string; displayName: string; colorCode: string } | null;
  serviceStaff: { id: string; displayName: string } | null;
  servicePlan: { name: string } | null;
}

interface DayViewProps {
  date: string;
  bookings: DayBooking[];
  /** 從 fetchDaySlots() 取得的實際可預約時段（已套用營業時間 + SlotOverride） */
  slots: SlotAvailability[];
  /** 內嵌模式：隱藏返回按鈕和日期導航 */
  inline?: boolean;
}

export function DayView({ date, bookings, slots, inline }: DayViewProps) {
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

  // 用 DB 時段建立 slot 列表；同時收集不在時段列表內的預約（歷史或異常）
  const slotTimeSet = new Set(slots.map((s) => s.startTime));
  const slotCapacityMap = new Map(slots.map((s) => [s.startTime, s.capacity]));

  // 找出有預約但不在當前時段設定中的 slotTime（歷史資料）
  const orphanSlotTimes = new Set<string>();
  for (const booking of bookings) {
    if (!slotTimeSet.has(booking.slotTime)) {
      orphanSlotTimes.add(booking.slotTime);
    }
  }

  // 合併：先顯示 DB 時段，再附加孤兒時段（排序）
  const allSlotTimes = [
    ...slots.map((s) => s.startTime),
    ...Array.from(orphanSlotTimes).sort(),
  ];

  // Group bookings by slot
  const slotMap = new Map<string, DayBooking[]>();
  for (const slot of allSlotTimes) {
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
    const staff = booking.revenueStaff || booking.customer.assignedStaff;
    if (staff) {
      staffSet.add(staff.displayName);
      staffColorMap.set(staff.displayName, staff.colorCode);
    }
  }
  const staffList = Array.from(staffSet);

  const activeBookingCount = bookings.filter((b) => b.bookingStatus !== "CANCELLED").length;
  const activePeopleCount = bookings.filter((b) => b.bookingStatus !== "CANCELLED").reduce((sum, b) => sum + (b.people ?? 1), 0);

  const isClosed = slots.length === 0 && bookings.length === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={`font-bold text-earth-900 ${inline ? "text-lg" : "text-2xl"}`}>
            {displayDate}（{dayLabel}）
          </h1>
          <p className="mt-1 text-sm text-earth-500">
            {isClosed ? (
              <span className="text-amber-600">公休日 — 不開放預約</span>
            ) : (
              <>共 {activeBookingCount} 筆預約（{activePeopleCount} 人）</>
            )}
          </p>
        </div>
        {!inline && (
          <Link
            href="/dashboard/bookings"
            className="rounded-lg border border-earth-300 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50 w-fit"
          >
            ← 返回月曆
          </Link>
        )}
      </div>

      {/* Day Navigation */}
      {!inline && (
        <div className="flex items-center gap-2">
          <Link
            href={`?view=day&date=${prevDateStr}`}
            className="rounded-lg border border-earth-300 px-3 py-2 text-sm hover:bg-earth-50"
          >
            ← 前一天
          </Link>
          <Link
            href={`?view=day&date=${nextDateStr}`}
            className="rounded-lg border border-earth-300 px-3 py-2 text-sm hover:bg-earth-50"
          >
            後一天 →
          </Link>
        </div>
      )}

      {/* Staff Color Legend */}
      {staffList.length > 0 && (
        <div className="flex flex-wrap gap-3 rounded-lg bg-earth-50 p-3">
          {staffList.map((staffName) => (
            <div key={staffName} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: staffColorMap.get(staffName) }}
              />
              <span className="text-xs font-medium text-earth-700">{staffName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Closed day message */}
      {isClosed && (
        <EmptyState
          icon="settings"
          title="此日為公休日或尚未設定預約時段"
          description="可在預約開放設定中調整營業時段"
          action={{ label: "前往預約開放設定", href: "/dashboard/settings/hours" }}
        />
      )}

      {/* Time Slots — 2-col grid on desktop */}
      {allSlotTimes.length > 0 && (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {allSlotTimes.map((slotTime) => {
            const slotBookings = slotMap.get(slotTime) || [];
            const activeCount = slotBookings.filter((b) => b.bookingStatus !== "CANCELLED").reduce((sum, b) => sum + (b.people ?? 1), 0);
            const capacity = slotCapacityMap.get(slotTime) ?? 0;
            const isOrphan = orphanSlotTimes.has(slotTime);
            const isFull = capacity > 0 && activeCount >= capacity;
            const isNearFull = capacity > 0 && activeCount >= capacity - 2;

            return (
              <div key={slotTime} className={`rounded-lg border bg-white p-3 ${isOrphan ? "border-amber-200 bg-amber-50/30" : "border-earth-200"}`}>
                {/* Time header */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-sm font-bold ${
                        isFull
                          ? "bg-red-100 text-red-700"
                          : isNearFull
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {slotTime}
                    </span>
                    {isOrphan && (
                      <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-600">
                        已關閉時段
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-earth-500">
                    <span
                      className={`font-semibold ${
                        isFull ? "text-red-600" : isNearFull ? "text-yellow-600" : "text-green-600"
                      }`}
                    >
                      {activeCount}
                    </span>
                    <span className="text-earth-400">/{capacity}</span>
                  </span>
                </div>

                {/* Booking cards — compact */}
                {slotBookings.length === 0 ? (
                  <p className="text-xs text-earth-300">暫無預約</p>
                ) : (
                  <div className="space-y-1.5">
                    {slotBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-shadow hover:shadow-md ${
                          STATUS_COLORS[booking.bookingStatus] || "border-earth-200 bg-white"
                        }`}
                      >
                        {/* Staff color dot */}
                        <div
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: (booking.revenueStaff || booking.customer.assignedStaff)?.colorCode || "#9ca3af" }}
                        />
                        <Link
                          href={`/dashboard/bookings/${booking.id}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium text-earth-900 hover:text-primary-700"
                        >
                          {booking.customer.name}
                          {booking.people > 1 && (
                            <span className="ml-1 inline-block rounded bg-earth-100 px-1 py-0.5 text-[10px] font-medium text-earth-600">
                              {booking.people}人
                            </span>
                          )}
                          {booking.isMakeup && (
                            <span className="ml-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">
                              補課
                            </span>
                          )}
                          {booking.isCheckedIn && booking.bookingStatus === "CONFIRMED" && (
                            <span className="ml-1 inline-block rounded bg-green-100 px-1 py-0.5 text-[10px] font-medium text-green-700">
                              已報到
                            </span>
                          )}
                        </Link>
                        {/* Quick actions — inline buttons for status changes */}
                        <BookingQuickActions
                          bookingId={booking.id}
                          status={booking.bookingStatus}
                          isCheckedIn={booking.isCheckedIn}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
