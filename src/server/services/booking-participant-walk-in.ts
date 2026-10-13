import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";
import { acquireBookingSlotLocks, bookingSlotTimeVariants } from "./booking-slot-lock";
import { initializeBookingParticipants } from "./booking-participants";
import { lockPaymentParticipant, synchronizeParticipantBooking } from "./booking-participant-payment";
import { releaseReserved } from "./booking-participant-lifecycle";

/** people remains the capacity projection consumed by every existing availability
 * reader/writer; originalPeople and participant identities remain immutable.
 * Cancellation retains a slot; deletion removes an unserved companion from the group.
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
  const [group] = await tx.$queryRaw<{ originalPeople: number }[]>`SELECT "originalPeople" FROM "BookingParticipantGroup"
    WHERE id = ${groupId} AND "storeId" = ${input.storeId}`;
  const position = Math.max(group.originalPeople, ...slots.map(person => person.position)) + 1;
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


/** Removes an unserved companion, whether reserved originally or added later.
 * Customer profiles remain independent; completed service and money cannot be erased.
 * Stable positions are never reused or renumbered when a middle slot is deleted.
 */
export async function removeBookingCompanion(tx: Prisma.TransactionClient, input: {
  storeId: string; bookingId: string; position: number; revision: number;
}) {
  if (input.position <= 1) throw new AppError("BUSINESS_RULE", "預約人不能從同行者名單刪除");
  const before = await tx.booking.findFirst({ where: { id: input.bookingId, storeId: input.storeId },
    select: { bookingDate: true, slotTime: true } });
  if (!before) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
  await acquireBookingSlotLocks(tx, [{ storeId: input.storeId,
    bookingDate: before.bookingDate.toISOString().slice(0, 10), slotTime: before.slotTime }]);
  const slots = await initializeBookingParticipants(tx, input);
  const slot = slots.find(person => person.position === input.position);
  if (!slot) throw new AppError("NOT_FOUND", "本次預約沒有這位同行者");
  const person = await lockPaymentParticipant(tx, input.storeId, slot.id);
  if (person.bookingDate.getTime() !== before.bookingDate.getTime() || person.slotTime !== before.slotTime)
    throw new AppError("CONFLICT", "預約已變更，請重新確認");
  const [schema] = await tx.$queryRaw<{ ready: boolean }[]>`SELECT
    COALESCE(pg_get_functiondef(to_regprocedure('public.booking_participant_legacy_guard()')), '')
      LIKE '%NEW.people < 1%' AS ready`;
  if (!schema?.ready) throw new AppError("BUSINESS_RULE", "同行者刪除更新尚未完成，請稍後再試");
  const [history] = await tx.$queryRaw<{ exists: boolean }[]>`SELECT (
    EXISTS (SELECT 1 FROM "Transaction" t WHERE t."storeId" = ${input.storeId}
      AND (t."unregisteredParticipantId" = ${person.id} OR t.id = ${person.collectionTransactionId}
        OR (t."bookingId" = ${input.bookingId} AND t."customerId" = ${person.customerId}
          AND t."transactionType"::text IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','SESSION_DEDUCTION'))))
    OR EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."storeId" = ${input.storeId}
      AND a."targetType" = 'BookingParticipant' AND a."targetId" = ${person.id}
      AND a."beforeJson"->>'status' = 'COMPLETED')) AS exists`;
  if (!['PENDING', 'CANCELLED', 'NO_SHOW'].includes(person.status) || person.revision !== input.revision ||
      person.arrivedAt || person.collectionTransactionId || history.exists)
    throw new AppError("BUSINESS_RULE", "已有收款或服務紀錄的同行者不能直接刪除，請先核對紀錄");
  await releaseReserved(tx, person);
  const deleted = await tx.$executeRaw`DELETE FROM "BookingParticipant"
    WHERE id = ${person.id} AND "groupId" = ${person.groupId} AND "storeId" = ${input.storeId}
      AND position > 1 AND revision = ${input.revision} AND status::text = ${person.status}
      AND "arrivedAt" IS NULL AND "collectionTransactionId" IS NULL`;
  if (deleted !== 1) throw new AppError("CONFLICT", "同行者資料已變更，請重新確認");
  await tx.$queryRaw`SELECT set_config('app.booking_walk_in_group', ${person.groupId}, true)`;
  const [booking] = await tx.$queryRaw<{ people: number }[]>`UPDATE "Booking" SET people = people - 1,
    "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${input.bookingId} AND "storeId" = ${input.storeId}
      AND people > 1 RETURNING people`;
  await tx.$queryRaw`SELECT set_config('app.booking_walk_in_group', '', true)`;
  if (!booking) throw new AppError("CONFLICT", "預約人數已變更，請重新確認");
  await synchronizeParticipantBooking(tx, input.storeId, person.groupId, input.bookingId);
  return { id: person.id, position: input.position, customerId: person.customerId, people: booking.people };
}
