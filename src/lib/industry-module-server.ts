import "server-only";

import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { resolveIndustryModuleId, type IndustryModuleId } from "@/lib/industry-modules";

/** Store.industryModule is the sole runtime authorization source for module-specific features. */
export async function getStoreIndustryModule(storeId: string): Promise<IndustryModuleId> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { industryModule: true },
  });
  if (!store) throw new AppError("NOT_FOUND", "店舖不存在");
  return resolveIndustryModuleId(store.industryModule);
}

export async function requireStoreIndustryModule(storeId: string, expected: IndustryModuleId): Promise<void> {
  const actual = await getStoreIndustryModule(storeId);
  if (actual !== expected) {
    throw new AppError("FORBIDDEN", `此功能僅適用於${expected === "spa" ? "SPA" : "蒸足"}門市`);
  }
}

export const requireSteamfootStore = (storeId: string) => requireStoreIndustryModule(storeId, "steamfoot");
export const requireSpaStore = (storeId: string) => requireStoreIndustryModule(storeId, "spa");
