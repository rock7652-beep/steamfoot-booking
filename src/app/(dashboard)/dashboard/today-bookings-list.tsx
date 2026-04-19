"use client";

import { useOptimistic } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { BookingQuickActions } from "./booking-quick-actions";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  STATUS_BORDER,
  STATUS_ROW_BG,
  STATUS_ICON,
} from "@/lib/booking-constants";

interface TodayBooking {
  id: string;
  slotTime: string;
  people: number;
  isMakeup: boolean;
  isCheckedIn: boolean;
  bookingStatus: string;
  customer: { name: string; phone: string };
  revenueStaff: { displayName: string; colorCode: string } | null;
}

interface Props {
  bookings: TodayBooking[];
}

type OptimisticAction = { id: string; newStatus: string };

export function TodayBookingsList({ bookings }: Props) {
  const [optimisticBookings, updateOptimistic] = useOptimistic(
    bookings,
    (state, action: OptimisticAction) =>
      state.map((b) =>
        b.id === action.id ? { ...b, bookingStatus: action.newStatus } : b,
      ),
  );

  const totalPeople = optimisticBookings.reduce((sum, b) => sum + b.people, 0);
  const completedPeople = optimisticBookings
    .filter((b) => b.bookingStatus === "COMPLETED")
    .reduce((sum, b) => sum + b.people, 0);
  const pct = totalPeople > 0 ? Math.round((completedPeople / totalPeople) * 100) : 0;

  return (
    <>
      {/* Progress summary */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-earth-500">
          已完成 <span className="font-semibold text-green-700">{completedPeople}</span>/{totalPeople} 人
        </span>
        <div className="h-1.5 flex-1 rounded-full bg-earth-100">
          <div
            className="h-1.5 rounded-full bg-green-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-earth-400">{pct}%</span>
      </div>

      <div className="rounded-xl border border-earth-100">
        {optimisticBookings.map((b, idx) => (
          <div
            key={b.id}
            className={`flex items-center gap-2 px-3 py-2 border-l-3 ${
              STATUS_BORDER[b.bookingStatus] ?? ""
            } ${STATUS_ROW_BG[b.bookingStatus] ?? ""} ${
              idx > 0 ? "border-t border-earth-100" : ""
            }`}
          >
            <Link
              href={`/dashboard/bookings/${b.id}`}
              className="flex flex-1 items-center gap-2 min-w-0 transition-colors hover:opacity-75"
            >
              <span className="w-12 text-sm font-bold text-primary-700 flex-shrink-0">{b.slotTime}</span>
              {b.revenueStaff && (
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: b.revenueStaff.colorCode }}
                />
              )}
              <span className="flex-1 truncate text-sm text-earth-800">{b.customer.name}</span>
              {b.people > 1 && (
                <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-600">
                  {b.people}位
                </span>
              )}
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[b.bookingStatus] ?? ""}`}>
                <span className="mr-0.5">{STATUS_ICON[b.bookingStatus] ?? ""}</span>
                {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
              </span>
            </Link>

            <BookingQuickActions
              bookingId={b.id}
              status={b.bookingStatus}
              isCheckedIn={b.isCheckedIn}
              onOptimisticUpdate={(newStatus) => updateOptimistic({ id: b.id, newStatus })}
            />
          </div>
        ))}
      </div>
    </>
  );
}
