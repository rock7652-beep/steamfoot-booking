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
  const storeName = store?.name?.trim();
  // Historical generic names still use the established customer-facing brand.
  // Once a store is renamed, the saved Store.name takes precedence even for legacy slugs.
  const legacyPlaceholder: Record<string, string> = {
    zhubei: "竹北店",
    hsinchu: "新竹店",
    taichung: "台中店",
  };
  if (storeName && storeName !== (slug ? legacyPlaceholder[slug] : undefined)) {
    return storeName;
  }
  if (slug && CUSTOMER_FACING_STORE_NAMES[slug]) {
    return CUSTOMER_FACING_STORE_NAMES[slug];
  }
  return storeName || FALLBACK_CUSTOMER_FACING_STORE_NAME;
}
