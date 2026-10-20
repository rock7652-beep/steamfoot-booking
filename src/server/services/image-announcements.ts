import "server-only";
import { prisma } from "@/lib/db";
import { announcementListSchema, type AnnouncementSnapshot } from "@/lib/image-announcements";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

export async function readAnnouncements(storeId: string): Promise<AnnouncementSnapshot> {
  await getStoreIndustryModule(storeId);
  const row = await prisma.imageAnnouncementSet.findUnique({ where: { storeId } });
  return { revision: row?.revision ?? 0, items: announcementListSchema.parse(row?.items ?? []) };
}
