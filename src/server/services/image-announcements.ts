import "server-only";
import { prisma } from "@/lib/db";
import { activeAnnouncements, announcementListSchema, type AnnouncementSnapshot } from "@/lib/image-announcements";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

export async function readAnnouncements(storeId: string): Promise<AnnouncementSnapshot> {
  await getStoreIndustryModule(storeId);
  const row = await prisma.imageAnnouncementSet.findUnique({ where: { storeId } });
  return { revision: row?.revision ?? 0, items: announcementListSchema.parse(row?.items ?? []) };
}

/** Initial announcements; preview=true is only supplied by an authorized manager preview. Optional content never blocks booking. */
export async function readInitialAnnouncements(storeId: string, authorizedPreview = false) {
  try {
    const store=await prisma.store.findFirst({where:{id:storeId,operatingStatus:{in:["ACTIVE","TRIAL"]}},select:{id:true}});
    if(!store)return [];
    const snapshot=await readAnnouncements(storeId);
    return authorizedPreview?snapshot.items:activeAnnouncements(snapshot.items);
  }
  catch { return null; }
}
