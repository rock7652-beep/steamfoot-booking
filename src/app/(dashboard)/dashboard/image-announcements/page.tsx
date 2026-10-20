import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { prisma } from "@/lib/db";
import { PageShell, PageHeader } from "@/components/desktop";
import { ImageAnnouncementManager } from "@/components/image-announcements/manager";
import { announcementModule, readAnnouncements } from "@/server/services/image-announcements";

export default async function ImageAnnouncementsPage() {
  const user = await getCurrentUser();
  if (!user || !await checkPermission(user.role, user.staffId, "business_hours.view")) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) return <PageShell><PageHeader title="圖片公告" /><p>請先選擇門市。</p></PageShell>;
  let canManage = await checkPermission(user.role, user.staffId, "business_hours.manage");
  if (canManage) { try { canManage = await resolveWriteStoreId(user) === storeId; } catch { canManage = false; } }
  const [store, initial, activeModule] = await Promise.all([
    prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { slug: true } }),
    readAnnouncements(storeId), announcementModule(storeId),
  ]);
  return <PageShell><PageHeader title="圖片公告" /><p className="text-sm text-earth-600">上傳圖片，顯示於前台首頁，顧客可點擊放大查看。</p><ImageAnnouncementManager key={storeId} initial={initial} storeId={storeId} storeSlug={store.slug} defaultModule={activeModule} canManage={canManage} /></PageShell>;
}
