import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { validateStoreAccess } from "@/lib/store";
import { activeAnnouncements } from "@/lib/image-announcements";
import { readAnnouncements, announcementModule } from "@/server/services/image-announcements";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const { id } = await params;
  const store = await prisma.store.findUnique({ where: { slug: url.searchParams.get("store") ?? "" }, select: { id: true, operatingStatus: true } });
  const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!store || store.operatingStatus !== "ACTIVE") return missing();
  let preview = false;
  if (url.searchParams.get("preview") === "1") {
    const user = await getCurrentUser();
    if (!user || !await checkPermission(user.role, user.staffId, "business_hours.view")) return missing();
    try { await validateStoreAccess(user, store.id, "read"); preview = true; } catch { return missing(); }
  }
  const snapshot = await readAnnouncements(store.id);
  const activeModule = await announcementModule(store.id);
  const items = preview ? snapshot.items : activeAnnouncements(snapshot.items, activeModule);
  if (id === "list" && !preview) return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  if (!items.some(item => item.id === id)) return missing();
  const asset = await prisma.imageAnnouncementAsset.findFirst({ where: { id, storeId: store.id } });
  if (!asset) return missing();
  return new Response(Buffer.from(asset.content), { headers: { "Content-Type": asset.mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
