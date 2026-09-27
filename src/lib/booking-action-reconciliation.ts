/** Compare only persisted fields; never infer failure from an unchanged snapshot. */
export type BookingActionExpectation = {
  status?: string;
  date?: string;
  slotTime?: string;
  attendedPeople?: number;
  makeupGranted?: boolean;
};
export function bookingMatchesExpectation(booking: {
  id: string; bookingStatus: string; bookingDate: string; slotTime: string;
  attendedPeople: number | null; noShowMakeupGranted?: boolean | null;
}, id: string, expected: BookingActionExpectation): boolean {
  if (booking.id !== id || Object.keys(expected).length === 0) return false;
  return (expected.status === undefined || booking.bookingStatus === expected.status)
    && (expected.date === undefined || booking.bookingDate === expected.date)
    && (expected.slotTime === undefined || booking.slotTime === expected.slotTime)
    && (expected.attendedPeople === undefined || booking.attendedPeople === expected.attendedPeople)
    && (expected.makeupGranted === undefined || booking.noShowMakeupGranted === expected.makeupGranted);
}
