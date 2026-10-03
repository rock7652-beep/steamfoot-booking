type Booking = { status: string; absenceKind?: string | null; customerId: string | null; assignedCoachId?: string | null };

/** A leave is retained in the class register even when its seat is released. */
export function scheduleRosterBookings<T extends Booking>(bookings: T[]): T[] {
  return bookings.filter(b => b.status !== "CANCELLED" || ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED", "TEACHER_ABSENT"].includes(b.absenceKind ?? ""));
}

export function scheduleOccupiedCount(bookings: Booking[]) {
  return bookings.filter(b => b.status !== "CANCELLED").length;
}

export function scheduleAssignedBookings<T extends Booking>(bookings: T[], assigned: string) {
  return scheduleRosterBookings(bookings).filter(b => assigned === "all" || (assigned === "none" ? !b.assignedCoachId : b.assignedCoachId === assigned));
}
