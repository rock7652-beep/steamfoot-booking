import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";

export type CourseCustomerPage = {
  total: number;
  page: number;
  rows: Array<{ id: string; lastVisitAt: string | null; points: number; sessions: number }>;
};

// Aggregate in the database before LIMIT: pagination and points sorting must
// include the entire visible store, never only the currently rendered customers.
export async function getCourseCustomerPage(
  storeId: string, role: string, staffId: string | null, params: URLSearchParams,
  canReadCards: boolean, now = new Date(),
): Promise<CourseCustomerPage> {
  const visibility = getManagerCustomerWhere(role, staffId, storeId);
  const staffScope = typeof visibility.assignedStaffId === "string" ? visibility.assignedStaffId : null;
  const requested = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(requested) ? Math.max(1, Math.min(50000, requested)) : 1;
  const search = (params.get("search") ?? "").trim().toLocaleLowerCase().slice(0, 200);
  const { start, end } = monthRange(toLocalMonthStr(now));
  const stale = new Date(now.getTime() - 30 * 86400000);
  const status = params.get("status") ?? "";
  const visit = params.get("visit") ?? "";
  const referral = params.get("referral") ?? "";
  const assigned = params.get("staff") ?? "";
  const sort = params.get("sort") ?? "recent";
  const order = sort === "points" && canReadCards ? Prisma.sql`points DESC`
    : sort === "created" ? Prisma.sql`"createdAt" DESC`
      : Prisma.sql`"lastVisitAt" DESC NULLS LAST`;
  const [result] = await prisma.$queryRaw<CourseCustomerPage[]>(Prisma.sql`
    WITH attendance AS (
      SELECT b."customerId", MAX(s."startsAt") AS "lastVisitAt"
      FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
      WHERE b."storeId"=${storeId} AND b.status='ATTENDED' GROUP BY b."customerId"
    ), held AS (
      SELECT "cardId", SUM("pointCost") AS amount FROM "CourseBooking"
      WHERE "storeId"=${storeId} AND status='RESERVED' AND ${canReadCards} GROUP BY "cardId"
    ), balances AS (
      SELECT m."customerId",
        SUM(CASE WHEN c.unit='SESSION' THEN 0 ELSE GREATEST(0,c.remaining-COALESCE(h.amount,0)) END)::int AS points,
        SUM(CASE WHEN c.unit='SESSION' THEN GREATEST(0,c.remaining-COALESCE(h.amount,0)) ELSE 0 END)::int AS sessions
      FROM "CoursePointCard" c JOIN "CourseCardMember" m ON m."cardId"=c.id AND m."storeId"=c."storeId"
      LEFT JOIN held h ON h."cardId"=c.id
      WHERE c."storeId"=${storeId} AND ${canReadCards} AND c."closedAt" IS NULL AND c."expiresAt">=${now}
      GROUP BY m."customerId"
    ), filtered AS (
      SELECT c.id,c.name,c."createdAt",a."lastVisitAt",COALESCE(b.points,0) AS points,
        COALESCE(b.sessions,0) AS sessions,CASE WHEN u.status='SUSPENDED' THEN 1 ELSE 0 END AS inactive
      FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId"
      LEFT JOIN attendance a ON a."customerId"=c.id LEFT JOIN balances b ON b."customerId"=c.id
      WHERE c."storeId"=${storeId} AND c."mergedIntoCustomerId" IS NULL
        AND (${staffScope}::text IS NULL OR c."assignedStaffId"=${staffScope})
        AND (${assigned}='' OR c."assignedStaffId"=${assigned})
        AND (${search}='' OR strpos(lower(concat(c.name,' ',c.phone,' ',c."lineName")),${search})>0)
        AND (${status}<>'linked' OR c."lineLinkStatus"='LINKED')
        AND (${status}<>'unlinked' OR c."lineLinkStatus"<>'LINKED')
        AND (${status}<>'lead' OR c."customerStage"='LEAD')
        AND (${status}<>'customer' OR c."customerStage"<>'LEAD')
        AND (${visit}<>'month' OR a."lastVisitAt" BETWEEN ${start} AND ${end})
        AND (${visit}<>'stale30' OR a."lastVisitAt"<${stale})
        AND (${visit}<>'never' OR a."lastVisitAt" IS NULL)
        AND (${referral}<>'has' OR EXISTS (SELECT 1 FROM "Customer" r WHERE r."storeId"=${storeId} AND r."sponsorId"=c.id AND r."mergedIntoCustomerId" IS NULL))
        AND (${referral}<>'none' OR NOT EXISTS (SELECT 1 FROM "Customer" r WHERE r."storeId"=${storeId} AND r."sponsorId"=c.id AND r."mergedIntoCustomerId" IS NULL))
    ), totals AS (
      SELECT COUNT(*)::int AS total,LEAST(${page},GREATEST(1,CEIL(COUNT(*)/20.0)::int))::int AS page FROM filtered
    ), paged AS (
      SELECT id,"lastVisitAt",points,sessions FROM filtered ORDER BY inactive,${order},name,id
      LIMIT 20 OFFSET (SELECT (page-1)*20 FROM totals)
    )
    SELECT total,page,COALESCE((SELECT json_agg(paged) FROM paged),'[]'::json) AS rows FROM totals
  `);
  return result;
}
