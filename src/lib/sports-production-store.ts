import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { sportsProductionEnabled } from "../../scripts/sports-production-scope.mjs";
import { AppError } from "@/lib/errors";

// Request-local only: a newly opened store must not wait for another deployment
// or a process-wide cache to expire. Module permissions remain authoritative.
const readSportsStore = cache(async (storeId: string) => {
  const rows = await prisma.$queryRaw<Array<{ enabled: boolean; activationRequired?: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "Store" s
      WHERE s.id = ${storeId} AND s."industryModule"::text = 'COURSE'
        AND EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" e
          WHERE e."storeId" = s.id AND e."featureKey" = 'business.fitness' AND e.status::text = 'ENABLED')
        AND NOT EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" e
          WHERE e."storeId" = s.id AND e."featureKey" = 'business.music' AND e.status::text = 'ENABLED')
    ) AS enabled,
    EXISTS (
      SELECT 1 FROM "Store" s
      WHERE s.id = ${storeId} AND s."industryModule"::text = 'COURSE'
        AND NOT EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" e
          WHERE e."storeId" = s.id AND e."featureKey" IN ('business.fitness', 'business.music') AND e.status::text = 'ENABLED')
    ) AS "activationRequired"
  `;
  if (rows[0]?.activationRequired) throw new AppError("FORBIDDEN", "請先開通運動或音樂模組，才能使用課程功能。");
  return rows[0]?.enabled === true;
});

export async function sportsProductionStore(storeId?: string): Promise<boolean> {
  if (process.env.VERCEL_ENV !== "production" || !storeId) return false;
  if (!await readSportsStore(storeId)) return false;
  return sportsProductionEnabled(storeId);
}
