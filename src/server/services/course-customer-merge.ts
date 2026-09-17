import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

/** Runs inside the existing customer merge transaction, after identity checks.
 * Caller holds the course store lock. No balance, financial row or name snapshot changes.
 */
export async function moveCourseCustomerRelations(tx: Prisma.TransactionClient, storeId: string, sourceId: string, targetId: string) {
  const conflicts = await tx.$queryRaw<Array<{ name: string; startsAt: Date }>>`
    SELECT s."nameSnapshot" AS name, s."startsAt" FROM "CourseBooking" a
    JOIN "CourseBooking" b ON b."storeId"=a."storeId" AND b."sessionId"=a."sessionId"
    JOIN "CourseSession" s ON s.id=a."sessionId" AND s."storeId"=a."storeId"
    WHERE a."storeId"=${storeId} AND a."customerId"=${sourceId} AND b."customerId"=${targetId}
      AND a.status<>'CANCELLED' AND b.status<>'CANCELLED' ORDER BY s."startsAt"`;
  if (conflicts.length) throw new AppError("CONFLICT", `兩筆顧客在 ${conflicts.length} 堂課都有未取消紀錄（${conflicts.map(row => row.name).join("、")}），請先核對；未搬移或取消任何預約。`);

  // A pending identity change must be resolved before the target of that request moves.
  const pending = await tx.lineRebindRequest.count({ where: { storeId, customerId: { in: [sourceId, targetId] }, status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] } } });
  if (pending) throw new AppError("CONFLICT", "顧客仍有進行中的 LINE 綁定申請，請先處理後再合併。");
  const reviews = await tx.centralMemberLinkReviewRequest.count({ where: { storeId, customerId: { in: [sourceId, targetId] }, status: "PENDING" } });
  if (reviews) throw new AppError("CONFLICT", "顧客仍有進行中的身分審核，請先處理後再合併。");
  const uncertainNotifications = await tx.messageLog.count({ where: { storeId, customerId: sourceId, status: { in: ["PENDING", "FAILED"] }, OR: [{ courseCardId: { not: null } }, { courseBookingId: { not: null } }] } });
  if (uncertainNotifications) throw new AppError("CONFLICT", "來源顧客有待處理或發送結果未確認的課程通知，請先核對發送紀錄後再合併。");

  // Same card membership is a set, never a new grant or a transfer of balances.
  const sharedMemberships = await tx.$executeRaw`
    DELETE FROM "CourseCardMember" a USING "CourseCardMember" b
    WHERE a."storeId"=${storeId} AND b."storeId"=a."storeId" AND a."cardId"=b."cardId"
      AND a."customerId"=${sourceId} AND b."customerId"=${targetId}`;
  const members = await tx.$executeRaw`UPDATE "CourseCardMember" SET "customerId"=${targetId} WHERE "storeId"=${storeId} AND "customerId"=${sourceId}`;
  const bookings = await tx.$executeRaw`UPDATE "CourseBooking" SET "customerId"=${targetId} WHERE "storeId"=${storeId} AND "customerId"=${sourceId}`;
  const operators = await tx.$executeRaw`UPDATE "CourseBooking" SET "operatorCustomerId"=${targetId} WHERE "storeId"=${storeId} AND "operatorCustomerId"=${sourceId}`;
  const purchases = await tx.$executeRaw`UPDATE "CoursePurchase" SET "customerId"=${targetId} WHERE "storeId"=${storeId} AND "customerId"=${sourceId}`;
  const health = await tx.customerHealthRecord.updateMany({ where: { storeId, customerId: sourceId }, data: { customerId: targetId } });
  // Optional mature health-history feature is not provisioned in every store database.
  // A missing table has no grants to move; any error on an existing table still aborts.
  const healthSchema = await tx.$queryRaw<Array<{ available: boolean }>>`SELECT to_regclass('public."CustomerHealthHistoryGrant"') IS NOT NULL AS available`;
  const healthHistoryGrantTableAvailable = healthSchema[0]?.available === true;
  const healthGrants = healthHistoryGrantTableAvailable
    ? await tx.customerHealthHistoryGrant.updateMany({ where: { targetStoreId: storeId, targetCustomerId: sourceId }, data: { targetCustomerId: targetId } })
    : { count: 0 };
  // Flatten earlier merges so old event identifiers remain discoverable after repeated merges.
  await tx.$executeRaw`UPDATE "Customer" SET "mergedIntoCustomerId"=${targetId} WHERE "storeId"=${storeId} AND "mergedIntoCustomerId"=${sourceId}`;

  // Most restrictive notification preference wins; preserve dedupe timing.
  // Keep the source row archived with the customer so old audit information survives.
  await tx.$executeRaw`
    INSERT INTO "CourseBalanceReminderPreference" (id,"storeId","customerId","stoppedAt","lastEventAt","createdAt")
    SELECT ${crypto.randomUUID()},"storeId",${targetId},"stoppedAt","lastEventAt","createdAt"
    FROM "CourseBalanceReminderPreference" WHERE "storeId"=${storeId} AND "customerId"=${sourceId}
    ON CONFLICT ("storeId","customerId") DO UPDATE SET
      "stoppedAt"=COALESCE("CourseBalanceReminderPreference"."stoppedAt",EXCLUDED."stoppedAt"),
      "lastEventAt"=GREATEST("CourseBalanceReminderPreference"."lastEventAt",EXCLUDED."lastEventAt")`;
  return { courseMembers: members, sharedMemberships, courseBookings: bookings, courseOperators: operators, coursePurchases: purchases, healthRecords: health.count, healthGrants: healthGrants.count, healthHistoryGrantTableAvailable };
}
