import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";
import { acquireBookingSlotLocks, bookingSlotTimeVariants } from "./booking-slot-lock";
import { initializeBookingParticipants } from "./booking-participants";

/** people remains the capacity projection consumed by every existing availability
 * reader/writer; originalPeople and RESERVATION positions remain immutable.
 * Cancelled slots are retained conservatively, and never recycled as a new person.
 */
export async function addBookingWalkIn(tx: Prisma.TransactionClient, input: {
  storeId: string; bookingId: string; requestId: string;
}) {
  const before = await tx.booking.findFirst({ where: { id: input.bookingId, storeId: input.storeId },
    select: { bookingDate: true, slotTime: true } });
  if (!before) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
  const date = before.bookingDate.toISOString().slice(0, 10);
  await acquireBookingSlotLocks(tx, [{ storeId: input.storeId, bookingDate: date, slotTime: before.slotTime }]);
  const slots = await initializeBookingParticipants(tx, input);
  const booking = await tx.booking.findFirst({ where: { id: input.bookingId, storeId: input.storeId },
    select: { bookingDate: true, slotTime: true, bookingStatus: true, people: true } });
  if (!booking || booking.bookingDate.getTime() !== before.bookingDate.getTime() || booking.slotTime !== before.slotTime)
    throw new AppError("CONFLICT", "預約已變更，請重新確認");
  // Deterministic key makes a lost-response retry return the original slot.
  const id = `walk-in:${input.bookingId}:${input.requestId}`;
  const existing = slots.find(slot => slot.id === id);
  if (existing) return { ...existing, created: false };
  if (!["PENDING", "CONFIRMED"].includes(booking.bookingStatus))
    throw new AppError("BUSINESS_RULE", "預約已結束，不能加人");
  if (slots.length >= 4 || booking.people >= 4) throw new AppError("BUSINESS_RULE", "本組最多 4 人");
  const context = await loadDayBusinessHoursContext(input.storeId, date, tx);
  const slot = applySlotOverrides(context.rule, context.slotOverrides).find(item =>
    item.startTime === booking.slotTime.slice(0, 5) && item.isEnabled);
  if (context.rule.closed || !slot) throw new AppError("BUSINESS_RULE", "此時段未開放");
  const occupied = await tx.booking.aggregate({ where: { storeId: input.storeId,
    bookingDate: booking.bookingDate, slotTime: { in: bookingSlotTimeVariants(booking.slotTime) },
    bookingStatus: { in: ["PENDING", "CONFIRMED"] } }, _sum: { people: true } });
  if ((occupied._sum.people ?? 0) >= slot.capacity) throw new AppError("BUSINESS_RULE", "此時段已滿，無法加人");
  const groupId = slots[0].groupId;
  const position = Math.max(...slots.map(person => person.position)) + 1;
  await tx.$executeRaw`INSERT INTO "BookingParticipant" (id, "groupId", "storeId", position, source, service)
    VALUES (${id}, ${groupId}, ${input.storeId}, ${position}, 'WALK_IN', 'FIRST_TRIAL')`;
  await tx.$queryRaw`SELECT set_config('app.booking_walk_in_group', ${groupId}, true)`;
  await tx.$executeRaw`UPDATE "Booking" SET people = people + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${input.bookingId} AND "storeId" = ${input.storeId}`;
  await tx.$queryRaw`SELECT set_config('app.booking_walk_in_group', '', true)`;
  // Keep response identity stable, including default revision.
  return { id, groupId, storeId: input.storeId, position, source: "WALK_IN" as const,
    customerId: null, service: "FIRST_TRIAL" as const, status: "PENDING" as const, revision: 1, created: true };
}
