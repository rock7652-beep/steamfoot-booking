import "server-only";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { deriveBaseUrl } from "@/lib/base-url";
import type { LineMessage } from "@/lib/line";

const PAGE_SIZE = 9;
const contact = { type: "button", style: "link", action: { type: "message", label: "聯繫店長", text: "轉真人" } };

// Read at click time. Never infer publication from availability for staff sales.
export async function publicPlanMessages(storeId: string, token: string, page: number): Promise<LineMessage[]> {
  const store = await prisma.store.findFirst({ where: { id: storeId, operatingStatus: "ACTIVE" }, select: { name: true, slug: true, industryModule: true } });
  if (!store) return [{ type: "text", text: "目前無法提供本店方案，請直接回覆訊息聯繫店家。" }];
  const paging = { skip: page * PAGE_SIZE, take: PAGE_SIZE + 1 };
  const payment = store.industryModule === "STEAMFOOT" ? await prisma.shopConfig.findUnique({ where: { storeId }, select: { bankAccountNumber: true } }) : null;
  let plans: { id: string; name: string; price: unknown; count: number; validityDays: number | null; description?: string | null }[] = [];
  if (store.industryModule === "STEAMFOOT") {
    const rows = await prisma.servicePlan.findMany({ where: { storeId, isActive: true, publicVisible: true, category: "PACKAGE" }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], ...paging, select: { id: true, name: true, price: true, sessionCount: true, validityDays: true, description: true } });
    plans = rows.map(p => ({ ...p, count: p.sessionCount }));
  } else if (store.industryModule === "SPA") {
    const treatments = await spaPrisma.spaTreatment.findMany({ where: { storeId, isActive: true }, select: { id: true } });
    const rows = await spaPrisma.spaPackage.findMany({ where: { storeId, isActive: true, publicVisible: true, treatmentId: { in: treatments.map(t => t.id) } }, orderBy: [{ name: "asc" }, { id: "asc" }], ...paging, select: { id: true, name: true, price: true, uses: true, validityDays: true } });
    plans = rows.map(p => ({ ...p, count: p.uses }));
  }
  const text = (value: string, extra = {}) => ({ type: "text", text: value, wrap: true, ...extra });
  if (!plans.length) return [{ type: "flex", altText: "本店方案", contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [text(store.name, { weight: "bold" }), text(page ? "已無更多公開方案，可重新查看最新列表。" : "目前尚無公開方案。若想了解適合您的服務，歡迎聯繫店長。", { margin: "md" })] }, footer: { type: "box", layout: "vertical", contents: [contact, { type: "button", action: { type: "postback", label: "重新查看", data: `trial-care:plans:${token}:0` } }] } } }];
  const bubbles: Record<string, unknown>[] = plans.slice(0, PAGE_SIZE).map(p => ({ type: "bubble", body: { type: "box", layout: "vertical", spacing: "md", contents: [text(store.name, { size: "xs", color: "#777777" }), text(p.name.slice(0, 200), { weight: "bold", size: "lg" }), text(`NT$${Number(p.price).toLocaleString("zh-TW")} · ${p.count} 堂`, { color: "#376452", weight: "bold" }), text(p.validityDays === null ? "使用期限：無期限" : `使用期限：${p.validityDays} 天`), ...(p.description ? [text(p.description.slice(0, 800), { size: "sm" })] : [])] }, footer: { type: "box", layout: "vertical", contents: [...(payment?.bankAccountNumber?.trim() ? [{ type: "button", style: "primary", color: "#376452", action: { type: "uri", label: "購買此方案", uri: `${deriveBaseUrl()}/s/${encodeURIComponent(store.slug)}/liff/wallets/shop/${encodeURIComponent(p.id)}` } }] : []), contact] } }));
  if (plans.length > PAGE_SIZE) bubbles.push({ type: "bubble", body: { type: "box", layout: "vertical", contents: [text("還有更多本店方案", { weight: "bold" })] }, footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "primary", color: "#376452", action: { type: "postback", label: "查看更多方案", data: `trial-care:plans:${token}:${page + 1}` } }] } });
  return [{ type: "flex", altText: `${store.name.slice(0, 100)}｜本店方案`, contents: { type: "carousel", contents: bubbles } }];
}
