import { resolveCentralMemberLineLoginChannelId } from "@/lib/liff/central-member-config";
import { getConfiguredStoreLine, storeLineIdentityProvider } from "@/lib/store-line-config";

/** Server-configured channel only. Never trust a client-supplied audience/provider. */
export function resolveStoreLiffContext(slug: string) {
  const config = getConfiguredStoreLine(slug);
  return {
    config,
    channelId: config?.loginChannelId ?? resolveCentralMemberLineLoginChannelId(),
    identityProvider: config ? storeLineIdentityProvider(config) : "line",
  };
}

/** Legacy central support is explicit for course stores through their existing LIFF
 * channel. A missing independent configuration must not silently validate centrally. */
export async function assertStoreLiffContext(
  store: { id: string; slug: string },
  context: ReturnType<typeof resolveStoreLiffContext>,
) {
  const { prisma } = await import("@/lib/db");
  const row = await prisma.store.findUnique({ where: { id: store.id }, select: { industryModule: true, liffId: true } });
  if (!row) throw new Error("LINE 店家不存在");
  if (context.config) {
    if (row.industryModule !== "COURSE" || (row.liffId && row.liffId !== context.config.liffId)) throw new Error("既有模組或 LIFF 設定不匹配，未覆蓋");
    if (store.id !== context.config.storeId || store.slug !== context.config.slug) throw new Error("LINE 店家設定不匹配");
    return;
  }
  if (row.industryModule === "COURSE" && !row.liffId?.startsWith(context.channelId + "-")) {
    throw new Error("本課程店尚未設定相符的 LINE Login channel");
  }
}
