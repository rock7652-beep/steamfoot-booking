type BookingAttendance = {
  status: string;
  checkedInAt?: string | Date | null;
};

/** Ordinary cancellations are excluded; leave cancellations are supplied separately. */
export function courseAttendanceProgress(bookings: BookingAttendance[], leaveCount = 0) {
  const active = bookings.filter((booking) => booking.status !== "CANCELLED");
  const total = active.length + leaveCount;
  const processed = leaveCount + active.filter((booking) =>
    booking.status === "ATTENDED" ||
    booking.status === "NO_SHOW" ||
    booking.status === "CHECKED_IN" ||
    (booking.status === "RESERVED" && Boolean(booking.checkedInAt)),
  ).length;
  return { total, processed, complete: total > 0 && processed === total };
}
