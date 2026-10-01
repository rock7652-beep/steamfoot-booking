type BookingAttendance = {
  status: string;
  absenceKind?: string | null;
  checkedInAt?: string | Date | null;
};

/** Ordinary cancellations are excluded; leave cancellations are supplied separately. */
export function courseAttendanceProgress(bookings: BookingAttendance[], leaveCount = 0) {
  const active = bookings.filter((booking) => booking.status !== "CANCELLED");
  const recordedLeaves = bookings.filter(booking => booking.status === "CANCELLED" && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")).length;
  const leaves = Math.max(leaveCount, recordedLeaves);
  const total = active.length + leaves;
  const processed = leaves + active.filter((booking) =>
    booking.status === "ATTENDED" ||
    booking.status === "NO_SHOW" ||
    booking.status === "CHECKED_IN" ||
    (booking.status === "RESERVED" && Boolean(booking.checkedInAt)),
  ).length;
  return { total, processed, complete: total > 0 && processed === total };
}

/** A recorded teacher absence closes attendance for the session while the teacher action returns learner quota. */
export function courseAttendanceState(bookings: BookingAttendance[], leaveCount = 0, teacherAttendance = "SCHEDULED") {
  const progress = courseAttendanceProgress(bookings, leaveCount);
  const teacherAbsent = teacherAttendance === "LEAVE" || teacherAttendance === "NO_SHOW";
  return { ...progress, teacherAbsent, complete: teacherAbsent || progress.complete };
}
