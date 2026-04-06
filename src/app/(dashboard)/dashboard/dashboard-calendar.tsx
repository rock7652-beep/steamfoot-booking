"use client";

import { useState } from "react";
import { CalendarMonth } from "./bookings/calendar-month";

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

  return (
    <CalendarMonth
      year={year}
      month={month}
      monthData={monthData}
      basePath="/dashboard"
      selectedDate={selectedDate}
      onDaySelect={(dateKey) => setSelectedDate(dateKey === selectedDate ? null : dateKey)}
    />
  );
}
