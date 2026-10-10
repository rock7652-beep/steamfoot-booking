import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { recordOperationAudit } from "./operation-audit";
import { refreshWalletCounter } from "./wallet-session";
import { lockPaymentParticipant, synchronizeParticipantBooking } from "./booking-participant-payment";

type Input = { storeId: string; participantId: string; revision: number; actorUserId: string; actor?: object };
type Person = Awaited<ReturnType<typeof lockPaymentParticipant>>;

/** Do not expose correction writes against the older immutable attendance guards. */
async function assertLifecycleReady(tx: Prisma.TransactionClient) {
  const [schema] = await tx.$queryRaw<{ ready: boolean }[]>`
    SELECT (COALESCE(pg_get_functiondef(to_regprocedure('public.booking_participant_identity_guard()')), '') LIKE '%app.booking_participant_correction%'
      AND COALESCE(pg_get_functiondef(to_regprocedure('public.booking_participant_wallet_guard()')), '') LIKE '%RESERVED%'
      AND COALESCE(pg_get_functiondef(to_regprocedure('public.booking_participant_legacy_guard()')), '') LIKE '%ELSE ''PENDING'' END%') AS ready`;
  if (!schema?.ready) throw new AppError("BUSINESS_RULE", "服務調整更新尚未完成，請稍後再試");
}


async function authorizeCorrection(tx: Prisma.TransactionClient, input: Input, person: Person, status: string, service = person.service) {
  const audit = await recordOperationAudit({ actor: input.actor, actorUserId: input.actorUserId, storeId: input.storeId,
    module: "STEAM", targetType: "BookingParticipant", targetId: person.id, action: "CORRECT_PARTICIPANT_SERVICE",
    summary: status === "PENDING" ? "調整這位顧客的服務方式或恢復待到店；原收款保留" : "取消這位顧客的名額並釋放預留堂數",
    before: { revision: person.revision, status: person.status, service: person.service, walletSessionId: person.walletSessionId, collectionTransactionId: person.collectionTransactionId },
    after: { revision: person.revision + 1, status, service } }, tx);
  await tx.$queryRaw`SELECT set_config('app.booking_participant_correction', ${audit.id}, true)`;
}
async function finishCorrection(tx: Prisma.TransactionClient, input: Input, person: Person) {
  await synchronizeParticipantBooking(tx, input.storeId, person.groupId, person.bookingId);
  await tx.$queryRaw`SELECT set_config('app.booking_participant_correction', '', true)`;
}
async function lockOwnWallet(tx: Prisma.TransactionClient, input: Input, person: Person, walletId: string) {
  if (!person.customerId) throw new AppError("BUSINESS_RULE", "請先補齊這位顧客資料");
  const wallets = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "CustomerPlanWallet" WHERE id = ${walletId} AND "storeId" = ${input.storeId}
      AND "customerId" = ${person.customerId} AND status = 'ACTIVE'
      AND "startDate" <= ${person.bookingDate} AND ("expiryDate" IS NULL OR "expiryDate" >= ${person.bookingDate}) FOR UPDATE`;
  if (!wallets.length) throw new AppError("BUSINESS_RULE", "方案不屬於這位顧客，或在預約日期無法使用");
}
async function releaseReserved(tx: Prisma.TransactionClient, person: Person) {
  if (!person.walletSessionId) return;
  const sessions = await tx.$queryRaw<{ id: string; walletId: string }[]>`
    SELECT s.id, s."walletId" FROM "WalletSession" s JOIN "CustomerPlanWallet" w ON w.id = s."walletId"
      WHERE s.id = ${person.walletSessionId} AND s."bookingId" = ${person.bookingId} AND s.status = 'RESERVED'
        AND w."storeId" = ${person.storeId} FOR UPDATE OF s`;
  // The locked participant query is store-scoped; wallet ownership is checked below.
  if (!sessions.length) throw new AppError("CONFLICT", "原預留堂數已變更，請重新確認");
  await tx.$executeRaw`UPDATE "WalletSession" SET status = 'AVAILABLE', "bookingId" = NULL, "reservedAt" = NULL
    WHERE id = ${sessions[0].id}`;
  await refreshWalletCounter(tx, sessions[0].walletId);
}

/** Select/reserve only. No arrival, completion, revenue, points or deduction. */
export async function selectParticipantPlan(tx: Prisma.TransactionClient, input: Input & { walletId: string | null }) {
  await assertLifecycleReady(tx);
  const person = await lockPaymentParticipant(tx, input.storeId, input.participantId);
  if (person.status !== "PENDING" || person.revision !== input.revision || !["PENDING", "CONFIRMED"].includes(person.bookingStatus)) {
    throw new AppError("CONFLICT", "這位顧客的狀態已變更，請重新確認");
  }
  if (person.collectionTransactionId) {
    const [receipt] = await tx.$queryRaw<{ corrected: boolean }[]>`
      SELECT (t.status::text IN ('VOIDED', 'CANCELLED') OR (t.amount > 0 AND GREATEST(COALESCE(t."refundAmount", 0),
        COALESCE((SELECT SUM(-r.amount) FROM "Transaction" r WHERE r."refundOfTransactionId" = t.id AND r."storeId" = t."storeId"
          AND r.status::text = 'SUCCESS' AND r."paymentStatus"::text IN ('SUCCESS', 'CONFIRMED')), 0)) >= t.amount)) AS corrected
      FROM "Transaction" t WHERE t.id = ${person.collectionTransactionId} AND t."storeId" = ${input.storeId} FOR UPDATE OF t`;
    if (!receipt?.corrected) throw new AppError("BUSINESS_RULE", "已有體驗收款，請先更正原款項，避免同時收費與扣堂");
  }
  if (input.walletId) await lockOwnWallet(tx, input, person, input.walletId);
  if (person.walletSessionId) {
    const [current] = await tx.$queryRaw<{ walletId: string }[]>`SELECT "walletId" FROM "WalletSession" WHERE id = ${person.walletSessionId}`;
    if (current?.walletId === input.walletId && !person.collectionTransactionId) {
      await tx.$queryRaw`SELECT set_config('app.booking_participant_correction', '', true)`;
      return { customerId: person.customerId, created: false };
    }
  }
  await authorizeCorrection(tx, input, person, "PENDING", input.walletId ? "PACKAGE_SESSION" : "FIRST_TRIAL");
  if (person.walletSessionId) await releaseReserved(tx, person);
  let sessionId: string | null = null;
  if (input.walletId) {
    const [session] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "WalletSession" WHERE "walletId" = ${input.walletId}
      AND status = 'AVAILABLE' ORDER BY "sessionNo" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!session) throw new AppError("BUSINESS_RULE", "方案沒有可預約堂數，請選其他方案");
    sessionId = session.id;
    await tx.$executeRaw`UPDATE "WalletSession" SET status = 'RESERVED', "bookingId" = ${person.bookingId}, "reservedAt" = CURRENT_TIMESTAMP
      WHERE id = ${sessionId} AND status = 'AVAILABLE'`;
    await refreshWalletCounter(tx, input.walletId);
  }
  await tx.$executeRaw`UPDATE "BookingParticipant" SET service = ${input.walletId ? 'PACKAGE_SESSION' : 'FIRST_TRIAL'},
    "walletSessionId" = ${sessionId}, "collectionTransactionId" = NULL, revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${person.id} AND "storeId" = ${input.storeId}`;
  await finishCorrection(tx, input, person);
  return { customerId: person.customerId, created: true };
}

/** Reverts just this person's completion. Cash receipts are deliberately retained. */
export async function revertParticipantService(tx: Prisma.TransactionClient, input: Input) {
  await assertLifecycleReady(tx);
  const person = await lockPaymentParticipant(tx, input.storeId, input.participantId);
  if (person.status === "PENDING" && person.revision === input.revision + 1) return { customerId: person.customerId, created: false };
  if (person.status !== "COMPLETED" || person.revision !== input.revision) throw new AppError("CONFLICT", "這位顧客的狀態已變更，請重新確認");
  await authorizeCorrection(tx, input, person, "PENDING");
  if (person.walletSessionId) {
    const [session] = await tx.$queryRaw<{ id: string; walletId: string; status: string }[]>`
      SELECT s.id, s."walletId", s.status::text FROM "CustomerPlanWallet" w JOIN "WalletSession" s ON s."walletId" = w.id
      WHERE s.id = ${person.walletSessionId} AND s."bookingId" = ${person.bookingId}
        AND w."customerId" = ${person.customerId} AND w."storeId" = ${input.storeId} FOR UPDATE OF w, s`;
    if (!session || session.status !== "COMPLETED") throw new AppError("CONFLICT", "原扣堂紀錄已變更，請核對後再撤回");
    const deductions = await tx.transaction.findMany({ where: { storeId: input.storeId, bookingId: person.bookingId,
      customerId: person.customerId!, customerPlanWalletId: session.walletId, transactionType: "SESSION_DEDUCTION", status: "SUCCESS" }, select: { id: true, amount: true } });
    if (deductions.length !== 1 || Number(deductions[0].amount) !== 0) throw new AppError("BUSINESS_RULE", "扣堂交易不一致，請先核對，不會自動更動款項");
    await tx.walletSession.updateMany({ where: { id: session.id, status: "COMPLETED" }, data: { status: "RESERVED", completedAt: null, reservedAt: new Date() } });
    await tx.transaction.updateMany({ where: { id: deductions[0].id, status: "SUCCESS" },
      data: { status: "VOIDED", voidedAt: new Date(), voidedByUserId: input.actorUserId, voidReason: "撤回這位顧客的完成服務，退回 1 堂" } });
    await tx.transactionAuditLog.create({ data: { storeId: input.storeId, transactionId: deductions[0].id,
      actorUserId: input.actorUserId, action: "VOID", beforeJson: { status: "SUCCESS" }, afterJson: { status: "VOIDED" }, reason: "逐人撤回完成並退堂" } });
    await refreshWalletCounter(tx, session.walletId);
  }
  await tx.$executeRaw`UPDATE "BookingParticipant" SET status = 'PENDING', "arrivedAt" = NULL, "completedAt" = NULL,
    revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${person.id} AND "storeId" = ${input.storeId}`;
  await finishCorrection(tx, input, person);
  return { customerId: person.customerId, created: true };
}

export async function cancelParticipantPlan(tx: Prisma.TransactionClient, input: Input & { status: "CANCELLED" | "NO_SHOW" }) {
  await assertLifecycleReady(tx);
  const person = await lockPaymentParticipant(tx, input.storeId, input.participantId);
  if (person.status !== "PENDING" || person.revision !== input.revision || person.collectionTransactionId || !["PENDING", "CONFIRMED"].includes(person.bookingStatus)) {
    throw new AppError("BUSINESS_RULE", "請先撤回完成；已收款須另行更正，不能直接取消");
  }
  await authorizeCorrection(tx, input, person, input.status);
  await releaseReserved(tx, person);
  await tx.$executeRaw`UPDATE "BookingParticipant" SET status = ${input.status}, "walletSessionId" = NULL,
    revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${person.id} AND "storeId" = ${input.storeId}`;
  await finishCorrection(tx, input, person);
  return { customerId: person.customerId, created: true };
}

export async function completePreviouslyPaidParticipant(tx: Prisma.TransactionClient, input: Input) {
  await assertLifecycleReady(tx);
  const person = await lockPaymentParticipant(tx, input.storeId, input.participantId);
  if (person.status !== "PENDING" || person.revision !== input.revision || !person.collectionTransactionId || person.walletSessionId || !["PENDING", "CONFIRMED"].includes(person.bookingStatus)) {
    throw new AppError("CONFLICT", "這位顧客的收款或服務狀態已變更");
  }
  const payment = await tx.transaction.findFirst({ where: { id: person.collectionTransactionId, storeId: input.storeId,
    customerId: person.customerId!, status: "SUCCESS", paymentStatus: { in: ["SUCCESS", "CONFIRMED"] }, refundAmount: 0 }, select: { id: true } });
  const refunds = await tx.transaction.count({ where: { refundOfTransactionId: person.collectionTransactionId,
    storeId: input.storeId, status: "SUCCESS", paymentStatus: { in: ["SUCCESS", "CONFIRMED"] } } });
  if (!payment || refunds) throw new AppError("BUSINESS_RULE", "原款項已更正或退款，請先核對收款");
  await tx.$executeRaw`UPDATE "BookingParticipant" SET status = 'COMPLETED', "arrivedAt" = CURRENT_TIMESTAMP,
    "completedAt" = CURRENT_TIMESTAMP, revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${person.id} AND "storeId" = ${input.storeId}`;
  await synchronizeParticipantBooking(tx, input.storeId, person.groupId, person.bookingId);
  // Re-completion does not charge again or award points a second time.
  return { customerId: person.customerId, created: true };
}
