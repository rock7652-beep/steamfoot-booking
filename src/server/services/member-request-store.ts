import { resolveStoreBySlug, resolveStoreSlugForLiff } from "@/lib/store-resolver";

/** Resolve the visible store, then let the membership/link checks authorize it. */
export async function resolveMemberRequestStoreId(fallbackStoreId: string | null) {
  const requestSlug = await resolveStoreSlugForLiff().catch(() => null);
  if (requestSlug) {
    const store = await resolveStoreBySlug(requestSlug).catch(() => null);
    if (store) return store.id;
  }
  return fallbackStoreId;
}
