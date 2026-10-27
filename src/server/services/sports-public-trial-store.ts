import "server-only";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export async function requireSportsPublicTrialStore(slug: string) {
  const store = await prisma.store.findUnique({ where: { slug }, select: {
    id: true, name: true, slug: true, industryModule: true, archivedAt: true, operatingStatus: true,
  } });
  if (!store || store.industryModule !== "COURSE" || store.archivedAt || !["ACTIVE", "TRIAL"].includes(store.operatingStatus))
    throw new AppError("NOT_FOUND", "本店尚未開放體驗預約");
  const [fitness, music] = await Promise.all([
    prisma.storeFeatureEntitlement.findFirst({ where: { storeId: store.id, featureKey: "business.fitness", status: "ENABLED" }, select: { id: true } }),
    prisma.storeFeatureEntitlement.findFirst({ where: { storeId: store.id, featureKey: "business.music", status: "ENABLED" }, select: { id: true } }),
  ]);
  if (!fitness || music) throw new AppError("FORBIDDEN", "此體驗入口僅適用運動門市");
  return store;
}

