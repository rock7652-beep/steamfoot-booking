import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

export type BookingParticipantRow = {
  id: string; groupId: string; storeId: string; position: number;
  source: "RESERVATION" | "WALK_IN"; customerId: string | null;
  service: "FIRST_TRIAL" | "SINGLE" | "PACKAGE_SESSION";
  status: "PENDING" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  revision: number;
};

/** Caller must provide its authorized store, in a single transaction.
 * Explicit initialization only: do not run this as a read-side backfill.
 * No wallet allocation, attendance, financial transaction or notification here.
 */
export async function initializeBookingParticipants(
  tx: Prisma.TransactionClient,
  input: { storeId: string; bookingId: string },
): Promise<BookingParticipantRow[]> {
  const bookings = await tx.$queryRaw<{ id: string; customerId: string; people: number; bookingType: string; bookingStatus: string; isMakeup: boolean }[]>`
    SELECT id, "customerId", people, "bookingType", "bookingStatus", "isMakeup"
    FROM "Booking" WHERE id = ${input.bookingId} AND "storeId" = ${input.storeId} FOR UPDATE`;
  const booking = bookings[0];
  if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
  const groups = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "BookingParticipantGroup" WHERE "bookingId" = ${booking.id} AND "storeId" = ${input.storeId}`;
  if (groups.length) return readParticipants(tx, input.storeId, groups[0].id);
  if (!["PENDING", "CONFIRMED"].includes(booking.bookingStatus)) {
    throw new AppError("BUSINESS_RULE", "歷史已結束預約須先核對，不可自動拆分");
  }
  // Package/makeup allocation must first become slot-scoped before it is enabled.
  if (booking.isMakeup || !["FIRST_TRIAL", "SINGLE"].includes(booking.bookingType)) {
    throw new AppError("BUSINESS_RULE", "方案與補課預約須先核對每位使用方式");
  }
  const payments = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Transaction" WHERE "bookingId" = ${booking.id} AND "storeId" = ${input.storeId} LIMIT 1`;
  if (payments.length) throw new AppError("BUSINESS_RULE", "已有整組交易，請先核對原收款，不能自動拆款");
  if (!Number.isInteger(booking.people) || booking.people < 1 || booking.people > 4) {
    throw new AppError("BUSINESS_RULE", "預約人數須介於 1 至 4 人");
  }
  const groupId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "BookingParticipantGroup" (id, "bookingId", "storeId", "originalPeople")
    VALUES (${groupId}, ${booking.id}, ${input.storeId}, ${booking.people})`;
  for (let position = 1; position <= booking.people; position++) {
    await tx.$executeRaw`
      INSERT INTO "BookingParticipant" (id, "groupId", "storeId", position, source, "customerId", service)
      VALUES (${randomUUID()}, ${groupId}, ${input.storeId}, ${position}, 'RESERVATION',
        ${position === 1 ? booking.customerId : null}, ${booking.bookingType})`;
  }
  return readParticipants(tx, input.storeId, groupId);
}

export async function readParticipants(tx: Prisma.TransactionClient, storeId: string, groupId: string): Promise<BookingParticipantRow[]> {
  return tx.$queryRaw<BookingParticipantRow[]>`
    SELECT id, "groupId", "storeId", position, source, "customerId", service, status, revision
    FROM "BookingParticipant" WHERE "storeId" = ${storeId} AND "groupId" = ${groupId} ORDER BY position`;
}

/** Link a confirmed existing member without moving or multiplying the slot.
 * CAS revision guards concurrent cashiers; resolved history cannot be reassigned.
 */
export async function linkBookingParticipantCustomer(tx: Prisma.TransactionClient, input: {
  storeId: string; participantId: string; customerId: string; revision: number;
}): Promise<void> {
  const bookings = await tx.$queryRaw<{ id: string; bookingStatus: string }[]>`
    SELECT b.id, b."bookingStatus" FROM "Booking" b
    JOIN "BookingParticipantGroup" g ON g."bookingId" = b.id AND g."storeId" = b."storeId"
    JOIN "BookingParticipant" p ON p."groupId" = g.id AND p."storeId" = g."storeId"
    WHERE p.id = ${input.participantId} AND b."storeId" = ${input.storeId} FOR UPDATE OF b`;
  if (!bookings[0]) throw new AppError("NOT_FOUND", "同行者不存在或不屬於本店");
  if (!["PENDING", "CONFIRMED"].includes(bookings[0].bookingStatus)) {
    throw new AppError("CONFLICT", "預約已結束，不能修改同行者身分");
  }
  const payments = await tx.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM "Transaction" t WHERE t."bookingId" = ${bookings[0].id} AND t."storeId" = ${input.storeId}
      AND NOT EXISTS (SELECT 1 FROM "BookingParticipant" p WHERE p."collectionTransactionId" = t.id AND p."storeId" = ${input.storeId}) LIMIT 1`;
  if (payments.length) throw new AppError("BUSINESS_RULE", "已有整組交易，請先核對原收款，不能變更同行者");
  const customers = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Customer" WHERE id = ${input.customerId} AND "storeId" = ${input.storeId}
      AND "mergedIntoCustomerId" IS NULL`;
  if (!customers.length) throw new AppError("NOT_FOUND", "顧客不存在或不屬於本店");
  // All participant mutations take the group lock before the child lock. The
  // database trigger also locks this group when enforcing capacity.
  await tx.$queryRaw`
    SELECT g.id FROM "BookingParticipantGroup" g
    JOIN "BookingParticipant" p ON p."groupId" = g.id AND p."storeId" = g."storeId"
    WHERE p.id = ${input.participantId} AND g."storeId" = ${input.storeId} FOR UPDATE OF g`;
  const participants = await tx.$queryRaw<BookingParticipantRow[]>`
    SELECT id, "groupId", "storeId", position, source, "customerId", service, status, revision
    FROM "BookingParticipant" WHERE id = ${input.participantId} AND "storeId" = ${input.storeId} FOR UPDATE`;
  const participant = participants[0];
  if (!participant) throw new AppError("NOT_FOUND", "同行者不存在或不屬於本店");
  if (participant.customerId === input.customerId) return; // Same request retry is a no-op.
  if (participant.revision !== input.revision || participant.status !== "PENDING" || participant.customerId) {
    throw new AppError("CONFLICT", "同行者資料已變更，請重新確認；已有紀錄不可直接換人");
  }
  const duplicate = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "BookingParticipant" WHERE "groupId" = ${participant.groupId}
      AND "storeId" = ${input.storeId} AND "customerId" = ${input.customerId}`;
  if (duplicate.length) throw new AppError("BUSINESS_RULE", "這位顧客已在本次預約中");
  const changed = await tx.$executeRaw(Prisma.sql`
    UPDATE "BookingParticipant" SET "customerId" = ${input.customerId}, revision = revision + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${participant.id} AND "storeId" = ${input.storeId} AND revision = ${input.revision}`);
  if (changed !== 1) throw new AppError("CONFLICT", "同行者資料已變更，請重新確認");
}
