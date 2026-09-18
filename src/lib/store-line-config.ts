import { z } from "zod";

// Server-only deployment configuration; values contain secret ENV NAMES, never tokens.
// Existing stores remain on their legacy path unless explicitly registered here.
const entrySchema = z.object({
  storeId: z.string().min(1), slug: z.string().regex(/^[a-z0-9-]+$/),
  identityMode: z.enum(["PROVIDER", "CENTRAL"]).optional(),
  providerId: z.string().regex(/^\d+$/),
  loginChannelId: z.string().regex(/^\d+$/),
  messagingProviderId: z.string().regex(/^\d+$/),
  messagingChannelId: z.string().regex(/^\d+$/),
  liffId: z.string().regex(/^\d+-[A-Za-z0-9]+$/),
  basicId: z.string().regex(/^@[A-Za-z0-9_.-]+$/),
  destination: z.string().regex(/^U[a-f0-9]{32}$/),
  accessTokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  channelSecretEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
}).strict();
export type StoreLineConfig = z.infer<typeof entrySchema>;

export function readStoreLineConfigs(): StoreLineConfig[] {
  const raw = process.env.STORE_LINE_CONFIG_JSON;
  if (!raw) return [];
  let entries: StoreLineConfig[];
  try { entries = z.array(entrySchema).parse(JSON.parse(raw)); }
  catch { throw new Error("每店 LINE 設定格式不正確；未使用中央備援"); }
  for (const key of ["storeId", "slug", "destination", "liffId"] as const) {
    if (new Set(entries.map(e => e[key])).size !== entries.length) throw new Error("每店 LINE 設定重複；未使用中央備援");
  }
  for (const e of entries) {
    if (entries.some(other => other !== e && (other.storeId === e.slug || other.slug === e.storeId))) throw new Error("LINE 店家識別重複");
    if (e.identityMode === "CENTRAL" && process.env.CENTRAL_LINE_PROVIDER_ID?.trim() !== e.providerId) throw new Error("中央 Provider 歸屬尚未核對");
    if (e.providerId !== e.messagingProviderId || !e.liffId.startsWith(e.loginChannelId + "-") ||
        e.accessTokenEnv.startsWith("NEXT_PUBLIC_") || e.channelSecretEnv.startsWith("NEXT_PUBLIC_")) {
      throw new Error("每店 LINE 通道或密鑰設定不相容；未使用中央備援");
    }
  }
  return entries;
}
export function getConfiguredStoreLine(storeIdOrSlug: string): StoreLineConfig | null {
  return readStoreLineConfigs().find(e => e.storeId === storeIdOrSlug || e.slug === storeIdOrSlug) ?? null;
}
export function storeLineIdentityProvider(config: StoreLineConfig): string {
  return config.identityMode === "CENTRAL" ? "line" : "line-provider:" + config.providerId;
}
