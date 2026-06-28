const CUSTOMER_FACING_STORE_NAMES: Record<string, string> = {
  zhubei: "暖暖蒸足",
  hsinchu: "以斯帖蒸足坊",
  taichung: "暖沐蒸足",
};

const FALLBACK_CUSTOMER_FACING_STORE_NAME = "蒸足健康站";

export function getCustomerFacingStoreName(
  store: { slug?: string | null; name?: string | null } | null | undefined
): string {
  const slug = store?.slug?.trim().toLowerCase();
  if (slug && CUSTOMER_FACING_STORE_NAMES[slug]) {
    return CUSTOMER_FACING_STORE_NAMES[slug];
  }

  const storeName = store?.name?.trim();
  return storeName || FALLBACK_CUSTOMER_FACING_STORE_NAME;
}
