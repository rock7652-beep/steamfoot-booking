"use client";

import { useState, useTransition } from "react";
import { CalendarMonth } from "./calendar-month";
import { DayView } from "./day-view";
import { fetchDayDetail } from "@/server/actions/slots";
import Link from "next/link";
import type { SlotAvailability } from "@/types";

interface MonthSummaryDay {
  date: string;
  totalBookingCount: number;
  totalPeople: number;
  staffBookings: Array<{ staffName: string; colorCode: string; count: number }>;
}

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

interface BookingsManagerProps {
  year: number;
  month: number;
  monthData: MonthSummaryDay[];
}

export function BookingsManager({ year, month, monthData }: BookingsManagerProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayBookings, setDayBookings] = useState<DayBooking[]>([]);
  const [daySlots, setDaySlots] = useState<SlotAvailability[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleDaySelect(dateKey: string) {
    if (selectedDate === dateKey) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(dateKey);
    startTransition(async () => {
      const result = await fetchDayDetail(dateKey);
      setDayBookings(result.bookings as DayBooking[]);
      setDaySlots(result.slots);
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-earth-900">預約排程</h1>
        <Link
          href="/dashboard/bookings/new"
          className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 active:bg-primary-800"
        >
          + 新增預約
        </Link>
      </div>

      {/* Calendar */}
      <CalendarMonth
        year={year}
        month={month}
        monthData={monthData}
        selectedDate={selectedDate}
        onDaySelect={handleDaySelect}
        hideInlineDetail
      />

      {/* Inline Day Detail */}
      {selectedDate && (
        <div className="rounded-xl border border-primary-200 bg-white shadow-sm">
          {isPending ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-earth-400">載入中...</span>
            </div>
          ) : (
            <div className="p-4">
              <DayView
                date={selectedDate}
                bookings={dayBookings}
                slots={daySlots}
                inline
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
