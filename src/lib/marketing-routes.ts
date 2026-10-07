/** Exact public aliases only: never capture store, API, LIFF or asset paths. */
const aliases: Record<string, string> = {
  "/": "/pricing/business",
  "/cases": "/pricing/cases",
  "/guides": "/pricing/guides",
  "/apply": "/pricing/apply.html",
  "/terms": "/pricing/terms.html",
  "/refunds": "/pricing/refunds.html",
};

// Let crawlers observe these existing 308 redirects without listing duplicate URLs.
export const MARKETING_LEGACY_PATHS = Object.values(aliases);

export function marketingRoute(pathname: string, storeDomain = false) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  // Dedicated store domains keep their customer homepage.
  if (path === "/" && storeDomain) return null;
  if (Object.hasOwn(aliases, path)) {
    return { kind: "rewrite" as const, destination: aliases[path] };
  }
  const entry = Object.entries(aliases).find(([, oldPath]) => oldPath === path);
  return entry ? { kind: "redirect" as const, destination: entry[0] } : null;
}
