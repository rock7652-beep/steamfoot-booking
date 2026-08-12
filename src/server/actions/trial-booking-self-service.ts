"use server";

import { z } from "zod";
import {
  cancelTrialBooking,
  confirmTrialBooking,
  getTrialBookingManagementStatus,
  listTrialRescheduleSlots,
  rescheduleTrialBooking,
} from "@/server/services/trial-booking-self-service";
import { revalidateBookings } from "@/lib/revalidation";

const tokenSchema = z.string().min(20).max(1024);
const slotSchema = z.object({ token: tokenSchema, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slotTime: z.string().regex(/^\d{2}:\d{2}$/) });

export async function confirmTrialBookingFromChat(token: string) {
  const result = await confirmTrialBooking(tokenSchema.parse(token));
  if (result === "confirmed") revalidateBookings();
  return result;
}
export async function cancelTrialBookingFromChat(token: string) {
  const result = await cancelTrialBooking(tokenSchema.parse(token));
  if (result === "cancelled") revalidateBookings();
  return result;
}
export async function getTrialRescheduleSlotsFromChat(token: string, date: string) {
  return listTrialRescheduleSlots(tokenSchema.parse(token), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date));
}
export async function getTrialBookingManagementStatusFromChat(token: string) {
  return getTrialBookingManagementStatus(tokenSchema.parse(token));
}
export async function rescheduleTrialBookingFromChat(input: z.input<typeof slotSchema>) {
  const { token, date, slotTime } = slotSchema.parse(input);
  const result = await rescheduleTrialBooking(token, date, slotTime);
  if (result === "rescheduled") revalidateBookings();
  return result;
}
