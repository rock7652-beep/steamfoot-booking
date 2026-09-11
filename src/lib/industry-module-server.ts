import "server-only";

import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  resolveIndustryModuleId,
  type IndustryModuleId,
} from "@/lib/industry-modules";

const MODULE_LABELS: Record<IndustryModuleId, string> = {
  steamfoot: "蒸足",
  spa: "SPA",
};

/**
 * Authoritative store-module lookup. This is the only supported source for
 * business authorization; demo flags, slugs and fixed IDs are presentation
 * details and must never replace this check.
 */
export async function getStoreIndustryModule(
  storeId: string,
): Promise<IndustryModuleId> {
  const stores = await prisma.$queryRaw<Array<{ industryModule: string }>>`
    SELECT "industryModule"::text AS "industryModule"
    FROM "Store"
    WHERE id = ${storeId}
    LIMIT 1
  `;
  if (!stores[0]) throw new AppError("NOT_FOUND", "店舖不存在");
  return resolveIndustryModuleId(stores[0].industryModule);
}

export async function requireStoreIndustryModule(
  storeId: string,
  expected: IndustryModuleId,
): Promise<void> {
  const actual = await getStoreIndustryModule(storeId);
  if (actual !== expected) {
    throw new AppError(
      "FORBIDDEN",
      `此功能僅適用於${MODULE_LABELS[expected]}門市`,
    );
  }
}

export function requireSteamfootStore(storeId: string): Promise<void> {
  return requireStoreIndustryModule(storeId, "steamfoot");
}

export function requireSpaStore(storeId: string): Promise<void> {
  return requireStoreIndustryModule(storeId, "spa");
}
