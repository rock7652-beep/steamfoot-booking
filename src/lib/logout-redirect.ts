const STORE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function logoutRedirectForStore(storeSlug: string | null | undefined, entry?: string | null): string {
  const slug = storeSlug?.trim().toLowerCase();
  if (!slug || !STORE_SLUG_RE.test(slug)) return "/hq/login";
  return entry === "liff" ? `/s/${slug}/liff/signed-out` : `/s/${slug}/`;
}
