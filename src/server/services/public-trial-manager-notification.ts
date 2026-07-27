import { notifyStoreManagerOnLine } from "@/server/services/store-manager-line-notifications";

export type PublicTrialManagerNotificationInput = {
  storeId: string;
  storeSlug: string;
  bookingId: string;
  customerName: string;
  phone: string;
  bookingDate: string;
  slotTime: string;
  people: number;
  expectedAmount: number;
};

/**
 * Best-effort adapter called only after the public trial booking transaction
 * has committed. LINE delivery must never change the customer-facing result.
 */
export async function notifyManagerOfPublicTrialBooking(
  input: PublicTrialManagerNotificationInput,
): Promise<void> {
  await notifyStoreManagerOnLine({
    type: "PUBLIC_TRIAL_BOOKING_CREATED",
    eventKey: `public-trial-booking:${input.bookingId}`,
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    customerName: input.customerName,
    phone: input.phone,
    bookingId: input.bookingId,
    bookingDate: input.bookingDate,
    slotTime: input.slotTime,
    people: input.people,
    expectedAmount: input.expectedAmount,
  });
}
