import "server-only";
import { prisma } from "@/lib/db";

export const LINE_QUOTA_STORE_FILTER = {
  operatingStatus: { in: ["ACTIVE", "TRIAL"] as ("ACTIVE" | "TRIAL")[] },
  isDemo: false,
  archivedAt: null,
};

/** Initialize new stores too, preserving any store's explicit opt-out. */
export async function initializeLineQuotaSettings() {
  const stores = await prisma.store.findMany({ where: LINE_QUOTA_STORE_FILTER, select: { id: true } });
  if (stores.length) await prisma.lineQuotaSetting.createMany({
    data: stores.map(store => ({ storeId: store.id, enabled: true })), skipDuplicates: true,
  });
}

export async function ensureLineQuotaSetting(storeId: string) {
  const store = await prisma.store.findFirst({ where: { id: storeId, ...LINE_QUOTA_STORE_FILTER }, select: { id: true } });
  if (!store) return null;
  return prisma.lineQuotaSetting.upsert({
    where: { storeId }, create: { storeId, enabled: true }, update: {},
    include: { store: { select: { name: true, industryModule: true } } },
  });
}
