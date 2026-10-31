import "server-only";
import { cache } from "react";
import {memoizeReadRequest,verifiedStaffRead} from "@/server/services/read-request-memo";
import { sportsNativePreview } from "@/lib/sports-native-preview";

import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isRuntimeIndustryModule, resolveIndustryModuleId, type IndustryModuleId } from "@/lib/industry-modules";

const MODULE_LABELS: Record<IndustryModuleId, string> = {
  steamfoot: "蒸足",
  beauty: "美業",
  spa: "SPA",
  course: "課程",
};

/**
 * Authoritative store-module lookup. This is the only supported source for
 * business authorization; demo flags, slugs and fixed IDs are presentation
 * details and must never replace this check.
 */
const previewModule=cache((storeId:string)=>prisma.$queryRaw<Array<{industryModule:string}>>`SELECT "industryModule"::text AS "industryModule" FROM "Store" WHERE id=${storeId} LIMIT 1`);

export async function getStoreIndustryModule(
  storeId: string,
): Promise<IndustryModuleId> {
  return memoizeReadRequest(`store.industry-module:${storeId}`,()=>readStoreIndustryModule(storeId));
}
async function readStoreIndustryModule(storeId:string):Promise<IndustryModuleId>{
  // Keep the existing production activation and preview-isolation guards even
  // when the same request already knows the current store's module.
  const native=await sportsNativePreview(storeId);
  const verified=verifiedStaffRead();
  const stores = verified?.storeId===storeId?[{industryModule:verified.industryModule}]:native?await previewModule(storeId):await prisma.$queryRaw<Array<{ industryModule: string }>>`
    SELECT "industryModule"::text AS "industryModule"
    FROM "Store"
    WHERE id = ${storeId}
    LIMIT 1
  `;
  if (!stores[0]) throw new AppError("NOT_FOUND", "店舖不存在");
  if (stores[0].industryModule === "SPA") {
    throw new AppError("FORBIDDEN", "SPA 模組已移除");
  }
  if (!isRuntimeIndustryModule(stores[0].industryModule)) {
    throw new AppError("FORBIDDEN", "店舖模組設定無效");
  }
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

export function requireCourseStore(storeId: string): Promise<void> {
  return requireStoreIndustryModule(storeId, "course");
}
