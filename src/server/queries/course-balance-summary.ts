import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CourseBalanceTotal } from "@/lib/course-balance-summary";

/** All active cards for the authorized customer, independent of list pagination/search. */
export async function getCourseBalanceSummary(storeId: string, customerId: string, music: boolean): Promise<CourseBalanceTotal[]> {
  const now = new Date();
  return prisma.$queryRaw<CourseBalanceTotal[]>(Prisma.sql`
    WITH held AS (
      SELECT "cardId", SUM("pointCost") AS amount FROM "CourseBooking"
      WHERE "storeId"=${storeId} AND status='RESERVED' GROUP BY "cardId"
    )
    SELECT c.unit, COUNT(*)::int AS count, SUM(c.remaining)::int AS remaining,
      SUM(COALESCE(h.amount,0))::int AS held,
      SUM(GREATEST(0,c.remaining-COALESCE(h.amount,0)))::int AS available
    FROM "CoursePointCard" c LEFT JOIN held h ON h."cardId"=c.id
    WHERE c."storeId"=${storeId} AND c."closedAt" IS NULL AND c."expiresAt">=${now}
      AND (NOT ${music} OR c.unit='SESSION')
      AND EXISTS (SELECT 1 FROM "CourseCardMember" m WHERE m."storeId"=${storeId} AND m."cardId"=c.id AND m."customerId"=${customerId})
    GROUP BY c.unit ORDER BY c.unit
  `);
}
