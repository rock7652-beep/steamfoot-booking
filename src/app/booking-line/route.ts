import { prisma } from "@/lib/db";
import { resolveBookingLineEntry } from "@/server/services/booking-line-entry";

/** Public metadata read only. No token minting, membership or booking writes. */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("store");
  const blocked = () => new Response("此店家尚未開通 LINE 身分驗證，請返回原店家頁面聯繫門市。", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  if (!slug || !/^[a-z0-9-]{1,100}$/.test(slug)) return blocked();
  const config = resolveBookingLineEntry(slug);
  if (!config) return blocked();
  const store = await prisma.store.findFirst({ where: {
    slug, ...(config.storeId ? { id: config.storeId } : {}),
    industryModule: { in: ["STEAMFOOT", "BEAUTY", "COURSE"] },
    operatingStatus: { in: ["ACTIVE", "TRIAL"] }, archivedAt: null,
  }, select: { id: true } });
  if (!store) return blocked();
  return new Response(null, { status: 307, headers: { Location: config.url, "Cache-Control": "private, no-store" } });
}
