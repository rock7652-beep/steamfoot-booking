import "server-only";
import { prisma } from "@/lib/db";
import { announcementListSchema, type AnnouncementModule, type AnnouncementSnapshot } from "@/lib/image-announcements";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

export async function announcementModule(storeId: string): Promise<AnnouncementModule> {
  if (await getStoreIndustryModule(storeId) === "steamfoot") return "steamfoot";
  const music = await prisma.storeFeatureEntitlement.findFirst({ where: { storeId, featureKey: "business.music", status: "ENABLED" }, select: { storeId: true } });
  return music ? "music" : "sports";
}
export async function readAnnouncements(storeId: string): Promise<AnnouncementSnapshot> {
  const row = await prisma.imageAnnouncementSet.findUnique({ where: { storeId } });
  return { revision: row?.revision ?? 0, items: announcementListSchema.parse(row?.items ?? []) };
}
