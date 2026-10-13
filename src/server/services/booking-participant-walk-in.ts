import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";
import { acquireBookingSlotLocks, bookingSlotTimeVariants } from "./booking-slot-lock";
import { initializeBookingParticipants } from "./booking-participants";

/** people remains the capacity projection consumed by every existing availability
 * reader/writer; originalPeople and RESERVATION positions remain immutable.
 * Cancelled slots remain for history; only a pristine latest WALK_IN slot can be deleted.
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
  const removedRequest = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AuditLog"
    WHERE "storeId" = ${input.storeId} AND "targetType" = 'Booking' AND "targetId" = ${input.bookingId}
      AND action = 'REMOVE_BOOKING_PARTICIPANT' AND "beforeJson"->>'participantId' = ${id} LIMIT 1`;
  if (removedRequest.length) throw new AppError("CONFLICT", "這筆臨時名額已移除，請重新新增");
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


/** Permanently removes only a pristine, unregistered walk-in slot that was added by mistake.
 * The participant is the latest walk-in so immutable positions never need to be renumbered.
 * Booking and capacity locks serialize this with concurrent add/check-in operations.
 */
export async function removeBookingWalkIn(tx: Prisma.TransactionClient, input: {
  storeId: string; bookingId: string; position: number; revision: number;
}) {
  const before = await tx.booking.findFirst({
    where: { id: input.bookingId, storeId: input.storeId },
    select: { bookingDate: true, slotTime: true, bookingStatus: true, people: true },
  });
  if (!before) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
  if (!["PENDING", "CONFIRMED"].includes(before.bookingStatus))
    throw new AppError("BUSINESS_RULE", "預約已結束，不能移除同行者");
  const date = before.bookingDate.toISOString().slice(0, 10);
  await acquireBookingSlotLocks(tx, [{ storeId: input.storeId, bookingDate: date, slotTime: before.slotTime }]);
  const slots = await initializeBookingParticipants(tx, { storeId: input.storeId, bookingId: input.bookingId });
  const slot = slots.find(person => person.position === input.position);
  if (!slot) throw new AppError("NOT_FOUND", "本次預約沒有這位同行者");
  const groupId = slots[0]?.groupId;
  if (!groupId) throw new AppError("NOT_FOUND", "本次預約沒有同行者資料");

  await tx.$queryRaw`SELECT id FROM "BookingParticipantGroup"
    WHERE id = ${groupId} AND "storeId" = ${input.storeId} FOR UPDATE`;
  const rows = await tx.$queryRaw<Array<{
    id: string; position: number; source: string; customerId: string | null; service: string; status: string;
    revision: number; arrivedAt: Date | null; collectionTransactionId: string | null; walletSessionId: string | null;
    latestWalkIn: boolean; hasLinkedTransaction: boolean;
  }>>`SELECT p.id, p.position, p.source, p."customerId", p.service, p.status, p.revision, p."arrivedAt",
      p."collectionTransactionId", p."walletSessionId",
      p.position = (SELECT MAX(w.position) FROM "BookingParticipant" w
        WHERE w."groupId" = p."groupId" AND w."storeId" = p."storeId" AND w.source = 'WALK_IN') AS "latestWalkIn",
      EXISTS (SELECT 1 FROM "Transaction" t WHERE t."storeId" = p."storeId"
        AND (t."unregisteredParticipantId" = p.id OR t.id = p."collectionTransactionId")) AS "hasLinkedTransaction"
    FROM "BookingParticipant" p
    WHERE p.id = ${slot.id} AND p."groupId" = ${groupId} AND p."storeId" = ${input.storeId}
    FOR UPDATE OF p`;
  const participant = rows[0];
  if (!participant) throw new AppError("NOT_FOUND", "同行者不存在或不屬於本店");
  if (participant.source !== "WALK_IN" || participant.service !== "FIRST_TRIAL" ||
      !(["PENDING", "CANCELLED"].includes(participant.status)) || participant.customerId !== null ||
      participant.revision !== input.revision || participant.arrivedAt !== null ||
      participant.collectionTransactionId !== null || participant.walletSessionId !== null ||
      participant.hasLinkedTransaction || !participant.latestWalkIn) {
    throw new AppError("BUSINESS_RULE", "只有最後一位尚未建檔、收款或開始服務的臨時加入者，才能直接移除；其他情況請恢復名額或新增同行者");
  }

  const deleted = await tx.$executeRaw`DELETE FROM "BookingParticipant"
    WHERE id = ${participant.id} AND "groupId" = ${groupId} AND "storeId" = ${input.storeId}
      AND source = 'WALK_IN' AND status::text = ${participant.status} AND "customerId" IS NULL
      AND service = 'FIRST_TRIAL' AND revision = ${input.revision}
      AND "arrivedAt" IS NULL AND "collectionTransactionId" IS NULL AND "walletSessionId" IS NULL`;
  if (deleted !== 1) throw new AppError("CONFLICT", "同行者資料已變更，請重新確認");

  await tx.$queryRaw`SELECT set_config('app.booking_walk_in_group', ${groupId}, true)`;
  const updated = await tx.$executeRaw`UPDATE "Booking" SET people = people - 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${input.bookingId} AND "storeId" = ${input.storeId} AND people > 1`;
  await tx.$queryRaw`SELECT set_config('app.booking_walk_in_group', '', true)`;
  if (updated !== 1) throw new AppError("CONFLICT", "預約人數已變更，請重新確認");
  return { id: participant.id, position: participant.position, people: before.people - 1 };
}
