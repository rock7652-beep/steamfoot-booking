import "server-only";
import type { PrismaClient } from "@prisma/client";
import { BUSINESS_PROFILE_FEATURES, resolveCourseBusinessProfile } from "@/lib/store-business-profile";
import type { Prisma } from "../../../generated/course-client";

/** Use the caller's reader/transaction. Module authorization belongs to course-access. */
export async function readCourseBusinessProfile(
  reader: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string,
) {
  const rows = await reader.$queryRaw<Array<{ featureKey: string }>>`
    SELECT "featureKey" FROM "StoreFeatureEntitlement"
    WHERE "storeId"=${storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
  return resolveCourseBusinessProfile(rows.map(row => row.featureKey));
}

export async function isMusicCourseStore(
  reader: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string,
) {
  return await readCourseBusinessProfile(reader, storeId) === "MUSIC";
}

/** Read-only/UI lookup keeps the existing entitlement client and the same resolver. */
export async function isMusicCourseStoreFromEntitlements(
  reader: Pick<PrismaClient, "storeFeatureEntitlement">, storeId: string,
) {
  const row = await reader.storeFeatureEntitlement.findFirst({
    where: { storeId, featureKey: BUSINESS_PROFILE_FEATURES.MUSIC, status: "ENABLED" },
    select: { storeId: true },
  });
  return resolveCourseBusinessProfile(row ? [BUSINESS_PROFILE_FEATURES.MUSIC] : []) === "MUSIC";
}
