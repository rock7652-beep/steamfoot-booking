"use client";

import { useState, useTransition } from "react";
import { CalendarMonth } from "./bookings/calendar-month";
import { DayView } from "./bookings/day-view";
import { fetchDayDetail } from "@/server/actions/slots";
import type { SlotAvailability } from "@/types";

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

interface DashboardCalendarProps {
  year: number;
  month: number;
  monthData: Array<{
    date: string;
    totalBookingCount: number;
    totalPeople: number;
    staffBookings: Array<{ staffName: string; colorCode: string; count: number }>;
  }>;
}

export function DashboardCalendar({ year, month, monthData }: DashboardCalendarProps) {
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
    <div className="space-y-3">
      <CalendarMonth
        year={year}
        month={month}
        monthData={monthData}
        basePath="/dashboard"
        selectedDate={selectedDate}
        onDaySelect={handleDaySelect}
        hideInlineDetail
      />

      {selectedDate && (
        <div className="rounded-xl border border-primary-200 bg-white p-4">
          {isPending ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <svg className="h-5 w-5 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
              <span className="text-sm text-earth-400">載入中...</span>
            </div>
          ) : (
            <DayView
              date={selectedDate}
              bookings={dayBookings}
              slots={daySlots}
              inline
            />
          )}
        </div>
      )}
    </div>
  );
}
