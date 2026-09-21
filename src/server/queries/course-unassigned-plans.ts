import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const COURSE_UNASSIGNED_PAGE_SIZE = 30;

/** Same predicate for the home count and paged list. History is not an active-balance test. */
export function courseUnassignedPlanWhere(storeId: string, staffScope: string | null) {
  return Prisma.sql`
    c."storeId"=${storeId} AND c."mergedIntoCustomerId" IS NULL
    AND (u.id IS NULL OR u.status='ACTIVE')
    ${staffScope ? Prisma.sql`AND c."assignedStaffId"=${staffScope}` : Prisma.empty}
    AND NOT EXISTS (
      SELECT 1 FROM "StaffMemberLink" l
      WHERE l."storeId"=c."storeId" AND l."userId"=c."userId" AND l."courseMemberEnabled"=false
    )
    AND NOT EXISTS (
      SELECT 1 FROM "CourseCardMember" m JOIN "CoursePointCard" k
        ON k.id=m."cardId" AND k."storeId"=m."storeId"
      WHERE m."storeId"=c."storeId" AND m."customerId"=c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "CoursePurchase" p
      WHERE p."storeId"=c."storeId" AND p."customerId"=c.id
        AND (p.status IN ('PENDING','CONFIRMED','REFUNDED') OR p."cardId" IS NOT NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM "CourseBooking" b
      WHERE b."storeId"=c."storeId" AND b."customerId"=c.id AND b."cardId" IS NOT NULL
    )`;
}

export async function getCourseUnassignedPlanCount(storeId: string, staffScope: string | null) {
  const [result] = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT count(*)::int total FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId"
    WHERE ${courseUnassignedPlanWhere(storeId, staffScope)}`);
  return result.total;
}

export type CourseUnassignedCustomer = {
  id: string; name: string; phoneLastFour: string | null; createdAt: string; staffName: string | null;
};

export async function getCourseUnassignedPlanPage(storeId: string, staffScope: string | null, requestedPage = 1) {
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(10000, Math.floor(requestedPage))) : 1;
  const size = COURSE_UNASSIGNED_PAGE_SIZE;
  // One statement snapshot keeps the count and rows aligned; stale page URLs clamp after assignments.
  const [result] = await prisma.$queryRaw<Array<{ total: number; page: number; rows: CourseUnassignedCustomer[] }>>(Prisma.sql`
    WITH candidates AS (
      SELECT c.id, c.name, RIGHT(c.phone,4) AS "phoneLastFour", c."createdAt", s."displayName" AS "staffName"
      FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId"
      LEFT JOIN "Staff" s ON s.id=c."assignedStaffId" AND s."storeId"=c."storeId"
      WHERE ${courseUnassignedPlanWhere(storeId, staffScope)}
    ), totals AS (SELECT count(*)::int total FROM candidates), paging AS (
      SELECT total, LEAST(${page}, GREATEST(1, CEIL(total::numeric/${size})::int))::int page FROM totals
    ), selected AS (
      SELECT * FROM candidates ORDER BY "createdAt",id
      LIMIT ${size} OFFSET (SELECT (page-1)*${size} FROM paging)
    )
    SELECT total,page,COALESCE((SELECT json_agg(selected ORDER BY "createdAt",id) FROM selected),'[]'::json) rows FROM paging`);
  return { ...result, pageSize: size };
}
