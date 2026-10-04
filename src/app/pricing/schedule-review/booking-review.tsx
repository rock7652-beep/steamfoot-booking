"use client";
import { useState } from "react";
import { BookingCalendarDesktop } from "@/app/(dashboard)/dashboard/bookings/booking-calendar-desktop";

const bookings = Array.from({ length: 5 }, (_, i) => ({ id: `rwd-booking-${i}`, slotTime: `${10 + i}:00`, customerName: `驗收顧客 ${i + 1}・長姓名測試`, bookingStatus: "CONFIRMED", isMakeup: false, people: 2, staffId: null, staffName: "驗收教練", staffColor: null }));

export function BookingReview() {
  const [date, setDate] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  return <>
    <h1 className="admin-page-title">蒸足預約月曆</h1>
    <p role="status">{booking ? `選取：${bookings.find(row => row.id === booking)?.customerName}` : date ? `選取日期：${date}` : "點選日期或預約檢查觸控區"}</p>
    <BookingCalendarDesktop compactHeader year={2026} month={10} monthData={[{ date: "2026-10-01", totalBookingCount: 5, totalPeople: 10, staffBookings: [], bookings }]} monthSchedule={{"2026-10-02": {status:"closed",slotCount:0}}} selectedDate={date} onDaySelect={setDate} onBookingClick={setBooking} />
  </>;
}
