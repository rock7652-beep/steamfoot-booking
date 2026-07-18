const STORE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function logoutRedirectForStore(storeSlug: string | null | undefined): string {
  const slug = storeSlug?.trim().toLowerCase();
  return slug && STORE_SLUG_RE.test(slug) ? `/s/${slug}/` : "/store-select";
}
