import { z } from "zod";
export const courseBookingWindowInput = z.discriminatedUnion("mode", [
  z.object({mode:z.literal("fixed"),date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/)}),
  z.object({mode:z.literal("rolling"),days:z.number().int().min(1).max(90)}),
]);
export const savedBookingWindow = z.object({date:z.string().nullable(),days:z.number().int(),opensAt:z.string().nullable()});
export type SavedBookingWindow = z.infer<typeof savedBookingWindow>;
export function bookingWindowRevision(value:SavedBookingWindow) {
  return JSON.stringify([value.date,value.days,value.opensAt]);
}
export const courseBookingWindowSaveInput = z.object({
  values:courseBookingWindowInput,
  expectedStoreId:z.string().min(1).max(100),requestKey:z.string().uuid(),
  expectedRevision:z.string().max(500),
});
