// Store-scoped URLs are the source of truth for the active customer store.
// Reuse the cookie that src/proxy.ts refreshes from every /s/[store] rewrite so
// a stale central-member selection can never override a newly opened store link.
export const CENTRAL_MEMBER_STORE_COOKIE = "store-slug";
