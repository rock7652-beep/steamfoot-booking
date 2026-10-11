import "server-only";
import type { Prisma, PaymentMethod } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { trialCollectionAmountError } from "@/lib/trial-collection-amount";
import type { TrialSettings } from "@/lib/shop-config";
import { buildTransactionSnapshot } from "@/lib/transaction-snapshot";
import { createFinancialTransaction } from "@/server/services/financial-transaction";
import { refreshWalletCounter } from "@/server/services/wallet-session";
import { awardPaidServiceAttendanceInTransaction } from "@/server/services/paid-booking-completion";

type LockedParticipant = {
  id: string; groupId: string; storeId: string; customerId: string | null; service: string; status: string;
  revision: number; collectionTransactionId: string | null; walletSessionId: string | null;
  bookingId: string; bookingStatus: string; bookingDate: Date; slotTime: string; servicePlanId: string | null;
};

export async function lockPaymentParticipant(tx: Prisma.TransactionClient, storeId: string, participantId: string) {
  // Same order as identity, legacy checkout and group-level mutations.
  const bookings = await tx.$queryRaw<{ id: string }[]>`
    SELECT b.id FROM "Booking" b
    JOIN "BookingParticipantGroup" g ON g."bookingId" = b.id AND g."storeId" = b."storeId"
    JOIN "BookingParticipant" p ON p."groupId" = g.id AND p."storeId" = g."storeId"
    WHERE p.id = ${participantId} AND b."storeId" = ${storeId} FOR UPDATE OF b`;
  if (!bookings[0]) throw new AppError("NOT_FOUND", "參與者不存在或不屬於本店");
  await tx.$queryRaw`
    SELECT g.id FROM "BookingParticipantGroup" g JOIN "BookingParticipant" p ON p."groupId" = g.id AND p."storeId" = g."storeId"
    WHERE p.id = ${participantId} AND g."storeId" = ${storeId} FOR UPDATE OF g`;
  const participants = await tx.$queryRaw<LockedParticipant[]>`
    SELECT p.id, p."groupId", p."storeId", p."customerId", p.service, p.status, p.revision, p."collectionTransactionId", p."walletSessionId",
      b.id AS "bookingId", b."bookingStatus", b."bookingDate", b."slotTime", b."servicePlanId"
    FROM "BookingParticipant" p
    JOIN "BookingParticipantGroup" g ON g.id = p."groupId" AND g."storeId" = p."storeId"
    JOIN "Booking" b ON b.id = g."bookingId" AND b."storeId" = g."storeId"
    WHERE p.id = ${participantId} AND p."storeId" = ${storeId} FOR UPDATE OF p`;
  const participant = participants[0];
  if (!participant) throw new AppError("NOT_FOUND", "參與者不存在或不屬於本店");
  const legacy = await tx.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM "Transaction" t WHERE t."bookingId" = ${participant.bookingId} AND t."storeId" = ${storeId}
      AND t."transactionType"::text IN ('TRIAL_PURCHASE', 'SINGLE_PURCHASE')
      AND t.status::text NOT IN ('VOIDED', 'CANCELLED')
      AND (t.amount = 0 OR GREATEST(COALESCE(t."refundAmount",0),
        COALESCE((SELECT SUM(-r.amount) FROM "Transaction" r WHERE r."refundOfTransactionId" = t.id
          AND r."storeId" = t."storeId" AND r.status::text = 'SUCCESS'
          AND r."paymentStatus"::text IN ('SUCCESS','CONFIRMED')),0)) < t.amount)
      AND NOT EXISTS (SELECT 1 FROM "BookingParticipant" p WHERE p."collectionTransactionId" = t.id AND p."storeId" = ${storeId}) LIMIT 1`;
  if (legacy.length) throw new AppError("BUSINESS_RULE", "已有整組收款，請先核對原款項");
  return participant;
}

/** Receipt completion changes only this person. Group completes when all slots resolve. */
export async function synchronizeParticipantBooking(tx: Prisma.TransactionClient, storeId: string, groupId: string, bookingId: string) {
  const [counts] = await tx.$queryRaw<{ pending: number; completed: number; arrived: number; cancelled: number; total: number }[]>`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
      count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
      count(*) FILTER (WHERE "arrivedAt" IS NOT NULL)::int AS arrived,
      count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
    FROM "BookingParticipant" WHERE "groupId" = ${groupId} AND "storeId" = ${storeId}`;
  const resolved = counts.total > 0 && counts.pending === 0;
  const nextStatus = counts.completed > 0 ? "COMPLETED" : counts.cancelled === counts.total ? "CANCELLED" : "NO_SHOW";
  await tx.$executeRaw`
    UPDATE "Booking" SET "attendedPeople" = ${counts.arrived}, "isCheckedIn" = ${counts.arrived > 0},
      "bookingStatus" = CASE WHEN ${resolved} THEN ${nextStatus}::"BookingStatus" ELSE CASE WHEN "bookingStatus" = 'CONFIRMED' THEN 'CONFIRMED'::"BookingStatus" ELSE 'PENDING'::"BookingStatus" END END,
      "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${bookingId} AND "storeId" = ${storeId}`;
  return resolved;
}

export async function collectParticipantTrialInTransaction(tx: Prisma.TransactionClient, input: {
  storeId: string; participantId: string; revision: number; amount: number;
  paymentMethod: PaymentMethod; note?: string; serviceStaffId: string | null; settings: TrialSettings;
}) {
  const person = await lockPaymentParticipant(tx, input.storeId, input.participantId);
  if (person.service !== "FIRST_TRIAL") throw new AppError("BUSINESS_RULE", "這位顧客不是體驗服務");
  if (!person.customerId) throw new AppError("BUSINESS_RULE", "請先補齊這位顧客的姓名與電話");
  if (person.collectionTransactionId) {
    const receipt = await tx.transaction.findFirst({ where: {
      id: person.collectionTransactionId, storeId: input.storeId, customerId: person.customerId,
      transactionType: "TRIAL_PURCHASE", status: "SUCCESS", paymentStatus: "SUCCESS",
    }, select: { id: true, amount: true, paymentMethod: true, note: true } });
    if (person.status === "COMPLETED" && receipt && Number(receipt.amount) === input.amount &&
      receipt.paymentMethod === input.paymentMethod && (receipt.note ?? "") === (input.note ?? "")) {
      return { transactionId: receipt.id, customerId: person.customerId, bookingId: person.bookingId, created: false };
    }
    throw new AppError("CONFLICT", "這位顧客已有收款紀錄，不能再次收款");
  }
  if (person.status !== "PENDING" || person.revision !== input.revision || !["PENDING", "CONFIRMED"].includes(person.bookingStatus)) {
    throw new AppError("CONFLICT", "這位顧客的狀態已變更，請重新確認");
  }
  const amountError = trialCollectionAmountError(input.amount, 1, input.settings);
  if (amountError) throw new AppError("VALIDATION", amountError);
  const customer = await tx.customer.findFirst({ where: { id: person.customerId, storeId: input.storeId, mergedIntoCustomerId: null },
    select: { assignedStaffId: true } });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在或已合併，請重新確認");
  const revenueStaffId = customer.assignedStaffId ?? input.serviceStaffId;
  if (!revenueStaffId) throw new AppError("BUSINESS_RULE", "無法判定營收歸屬，請指派店長");
  const staff = await tx.staff.findFirst({ where: { id: revenueStaffId, storeId: input.storeId }, select: { id: true } });
  if (!staff) throw new AppError("BUSINESS_RULE", "營收歸屬店長不屬於本店");
  const snapshot = await buildTransactionSnapshot(tx, { customerId: person.customerId, storeId: input.storeId,
    revenueStaffId, planId: person.servicePlanId, grossAmount: input.amount, netAmount: input.amount });
  await tx.$queryRaw`SELECT set_config('app.booking_participant_id', ${person.id}, true)`;
  const receipt = await createFinancialTransaction(tx, { data: {
    ...snapshot, customerId: person.customerId, storeId: input.storeId, bookingId: person.bookingId,
    revenueStaffId, serviceStaffId: input.serviceStaffId, soldByStaffId: input.serviceStaffId,
    transactionType: "TRIAL_PURCHASE", paymentMethod: input.paymentMethod, paymentStatus: "SUCCESS",
    paidAt: new Date(), amount: input.amount, note: input.note || null,
  } });
  await tx.$queryRaw`SELECT set_config('app.booking_participant_id', '', true)`;
  const changed = await tx.$executeRaw`
    UPDATE "BookingParticipant" SET status = 'COMPLETED', "collectionTransactionId" = ${receipt.id},
      "arrivedAt" = CURRENT_TIMESTAMP, "completedAt" = CURRENT_TIMESTAMP, revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${person.id} AND "storeId" = ${input.storeId} AND revision = ${input.revision} AND status = 'PENDING'`;
  if (changed !== 1) throw new AppError("CONFLICT", "收款狀態已變更，請重新確認");
  const [previousCompletion] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "AuditLog" WHERE "storeId" = ${input.storeId} AND "targetType" = 'BookingParticipant'
      AND "targetId" = ${person.id} AND action = 'CORRECT_PARTICIPANT_SERVICE'
      AND "beforeJson"->>'status' = 'COMPLETED' LIMIT 1`;
  if (!previousCompletion) await awardPaidServiceAttendanceInTransaction(tx, { customerId: person.customerId, storeId: input.storeId,
    bookingDate: person.bookingDate, slotTime: person.slotTime });
  await synchronizeParticipantBooking(tx, input.storeId, person.groupId, person.bookingId);
  return { transactionId: receipt.id, customerId: person.customerId, bookingId: person.bookingId, created: true };
}

export async function resolveUnattendedParticipant(tx: Prisma.TransactionClient, input: {
  storeId: string; participantId: string; revision: number; status: "NO_SHOW" | "CANCELLED";
}) {
  const person = await lockPaymentParticipant(tx, input.storeId, input.participantId);
  if (person.status === input.status && !person.collectionTransactionId) return { bookingId: person.bookingId };
  if (person.status !== "PENDING" || person.revision !== input.revision || person.collectionTransactionId ||
    !["PENDING", "CONFIRMED"].includes(person.bookingStatus)) throw new AppError("CONFLICT", "已有服務或收款紀錄，不能直接改為未到／取消");
  if (person.service === "PACKAGE_SESSION") {
    throw new AppError("BUSINESS_RULE", "請由每位服務的取消操作釋放方案堂數");
  }
  await tx.$executeRaw`UPDATE "BookingParticipant" SET status = ${input.status}, revision = revision + 1,
    "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${person.id} AND "storeId" = ${input.storeId}`;
  await synchronizeParticipantBooking(tx, input.storeId, person.groupId, person.bookingId);
  return { bookingId: person.bookingId };
}

/** Use one AVAILABLE session owned by this exact person in this exact store.
 * No whole-booking completeSessions/releaseSessions call can debit a companion.
 */
export async function completeParticipantOwnPlan(tx: Prisma.TransactionClient, input: {
  storeId: string; participantId: string; revision: number; walletId: string; serviceStaffId?: string | null;
}) {
  const person = await lockPaymentParticipant(tx, input.storeId, input.participantId);
  const [binding] = await tx.$queryRaw<{ walletSessionId: string | null }[]>`
    SELECT "walletSessionId" FROM "BookingParticipant" WHERE id = ${person.id} AND "storeId" = ${input.storeId}`;
  if (!person.customerId) throw new AppError("BUSINESS_RULE", "請先選擇這位顧客");
  if (person.status === "COMPLETED" && binding?.walletSessionId) {
    const session = await tx.walletSession.findFirst({ where: { id: binding.walletSessionId, walletId: input.walletId,
      status: "COMPLETED", bookingId: person.bookingId, wallet: { customerId: person.customerId, storeId: input.storeId } }, select: { id: true } });
    if (session) return { bookingId: person.bookingId, customerId: person.customerId, created: false };
  }
  if (person.status !== "PENDING" || person.revision !== input.revision || person.collectionTransactionId ||
    !["PENDING", "CONFIRMED"].includes(person.bookingStatus)) throw new AppError("CONFLICT", "這位顧客的狀態已變更，請重新確認");
  // Lock the wallet before selecting its next session, including competing reservations/refunds.
  const wallets = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "CustomerPlanWallet" WHERE id = ${input.walletId} AND "storeId" = ${input.storeId}
      AND "customerId" = ${person.customerId} AND status IN ('ACTIVE', 'USED_UP')
      AND "startDate" <= ${person.bookingDate} AND ("expiryDate" IS NULL OR "expiryDate" >= ${person.bookingDate}) FOR UPDATE`;
  if (!wallets.length) throw new AppError("BUSINESS_RULE", "本人方案已失效或不屬於這位顧客");
  const sessions = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "WalletSession" WHERE "walletId" = ${input.walletId} AND (
      (${person.walletSessionId}::text IS NOT NULL AND id = ${person.walletSessionId} AND status = 'RESERVED' AND "bookingId" = ${person.bookingId}) OR
      (${person.walletSessionId}::text IS NULL AND status = 'AVAILABLE'))
      ORDER BY "sessionNo" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
  if (!sessions.length) throw new AppError("BUSINESS_RULE", "本人方案沒有可用堂數");
  const sessionId = sessions[0].id;
  const changed = await tx.walletSession.updateMany({ where: { id: sessionId, status: person.walletSessionId ? "RESERVED" : "AVAILABLE", walletId: input.walletId },
    data: { status: "COMPLETED", bookingId: person.bookingId, completedAt: new Date() } });
  if (changed.count !== 1) throw new AppError("CONFLICT", "堂數已被其他操作使用，請重新確認");
  await tx.$executeRaw`UPDATE "BookingParticipant" SET service = 'PACKAGE_SESSION', "walletSessionId" = ${sessionId},
    status = 'COMPLETED', "arrivedAt" = CURRENT_TIMESTAMP, "completedAt" = CURRENT_TIMESTAMP,
    revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${person.id} AND "storeId" = ${input.storeId}`;
  const customer = await tx.customer.findFirst({ where: { id: person.customerId, storeId: input.storeId, mergedIntoCustomerId: null },
    select: { assignedStaffId: true } });
  const revenueStaffId = customer?.assignedStaffId ?? input.serviceStaffId ?? null;
  if (!customer || !revenueStaffId) throw new AppError("BUSINESS_RULE", "無法判定本人服務歸屬，請指派店長");
  const staff = await tx.staff.findFirst({ where: { id: revenueStaffId, storeId: input.storeId }, select: { id: true } });
  if (!staff) throw new AppError("BUSINESS_RULE", "服務歸屬店長不屬於本店");
  await createFinancialTransaction(tx, { data: { customerId: person.customerId, storeId: input.storeId,
    bookingId: person.bookingId, customerPlanWalletId: input.walletId, revenueStaffId,
    serviceStaffId: input.serviceStaffId ?? null, transactionType: "SESSION_DEDUCTION", paymentMethod: "CASH",
    amount: 0, quantity: 1, note: "本人方案出席扣 1 堂" } });
  await refreshWalletCounter(tx, input.walletId);
  const [previousCompletion] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "AuditLog" WHERE "storeId" = ${input.storeId} AND "targetType" = 'BookingParticipant'
      AND "targetId" = ${person.id} AND action = 'CORRECT_PARTICIPANT_SERVICE'
      AND "beforeJson"->>'status' = 'COMPLETED' LIMIT 1`;
  if (!previousCompletion) await awardPaidServiceAttendanceInTransaction(tx, { customerId: person.customerId, storeId: input.storeId,
    bookingDate: person.bookingDate, slotTime: person.slotTime });
  await synchronizeParticipantBooking(tx, input.storeId, person.groupId, person.bookingId);
  return { bookingId: person.bookingId, customerId: person.customerId, created: true };
}
