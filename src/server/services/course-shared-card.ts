import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "../../../generated/course-client";
import { resolveCourseSharedCardState, type CourseSharedCardSnapshot } from "@/lib/course-shared-card-policy";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
type SnapshotRow = Omit<CourseSharedCardSnapshot, "entitlement"> & {
  status: "ENABLED" | "DISABLED" | "LOCKED" | "HIDDEN" | null;
  startsAt: Date | null;
  expiresAt: Date | null;
};

/** Uncached; mutation callers hold the same Store lock as HQ control writes. */
export async function readCourseSharedCardSnapshot(tx: Reader, storeId: string): Promise<CourseSharedCardSnapshot | null> {
  const rows = await tx.$queryRaw<SnapshotRow[]>`
    SELECT s."industryModule"::text AS "industryModule",
      EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" m
        WHERE m."storeId" = s.id AND m."featureKey" = 'business.music'
          AND m.status::text = 'ENABLED') AS music,
      e.status::text AS status, e."startsAt", e."expiresAt"
    FROM "Store" s LEFT JOIN "StoreFeatureEntitlement" e
      ON e."storeId" = s.id AND e."featureKey" = 'shared_card'
    WHERE s.id = ${storeId} LIMIT 1`;
  const row = rows[0];
  return row ? {
    industryModule: row.industryModule,
    music: row.music,
    entitlement: row.status ? { status: row.status, startsAt: row.startsAt, expiresAt: row.expiresAt } : null,
  } : null;
}

export async function getCourseSharedCardStateInTransaction(tx: Reader, storeId: string) {
  return resolveCourseSharedCardState(await readCourseSharedCardSnapshot(tx, storeId));
}

export async function getCourseSharedCardState(storeId: string) {
  return getCourseSharedCardStateInTransaction(prisma, storeId);
}
