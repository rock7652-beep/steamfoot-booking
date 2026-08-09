"use server";

import { z } from "zod";
import {
  cancelTrialBooking,
  confirmTrialBooking,
  listTrialRescheduleSlots,
  rescheduleTrialBooking,
} from "@/server/services/trial-booking-self-service";

const tokenSchema = z.string().min(20).max(1024);
const slotSchema = z.object({ token: tokenSchema, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slotTime: z.string().regex(/^\d{2}:\d{2}$/) });

export async function confirmTrialBookingFromChat(token: string) { return confirmTrialBooking(tokenSchema.parse(token)); }
export async function cancelTrialBookingFromChat(token: string) { return cancelTrialBooking(tokenSchema.parse(token)); }
export async function getTrialRescheduleSlotsFromChat(token: string, date: string) {
  return listTrialRescheduleSlots(tokenSchema.parse(token), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date));
}
export async function rescheduleTrialBookingFromChat(input: z.input<typeof slotSchema>) {
  const { token, date, slotTime } = slotSchema.parse(input);
  return rescheduleTrialBooking(token, date, slotTime);
}
