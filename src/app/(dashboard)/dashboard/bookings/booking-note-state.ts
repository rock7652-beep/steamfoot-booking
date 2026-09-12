export type BookingNotePatch =
  | { kind: "booking"; bookingId: string; value: string | null }
  | { kind: "customer"; bookingId: string; customerId: string; value: string | null };

export function applyBookingNotePatch<T extends {
  id: string;
  notes?: string | null;
  customer: { id: string; serviceNote: string | null };
}>(booking: T, patch: BookingNotePatch): T {
  if (patch.kind === "booking") {
    return booking.id === patch.bookingId ? { ...booking, notes: patch.value } : booking;
  }
  return booking.customer.id === patch.customerId
    ? { ...booking, customer: { ...booking.customer, serviceNote: patch.value } }
    : booking;
}
