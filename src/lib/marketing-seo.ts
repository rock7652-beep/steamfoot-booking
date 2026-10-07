import type { Metadata } from "next";

// Public marketing identity only. Never use this as an auth/store URL fallback.
export const MARKETING_ORIGIN = "https://www.steamfoot.com";

// Reviewed, public destinations only; never discover URLs from tenant data,
// query strings, request hosts, filesystem routes, or authenticated navigation.
export const MARKETING_SITEMAP_PATHS = [
  "/", "/pricing", "/pricing/features", "/cases", "/guides",
  "/pricing/features/slots", "/pricing/features/services",
  "/pricing/features/music", "/pricing/features/fitness",
  "/apply", "/privacy", "/terms", "/refunds",
] as const;

export function isMarketingIndexingEnabled() {
  return process.env.VERCEL_ENV === "production";
}

export function isCanonicalMarketingRequest(request: Request) {
  // Next may use an internal origin for Route Handler request.url. Compare
  // the incoming Host, but never use it to construct a sitemap/canonical URL.
  const host = request.headers.get("host") ?? new URL(request.url).host;
  return isMarketingIndexingEnabled() && host.toLowerCase() === new URL(MARKETING_ORIGIN).host;
}

export function marketingMetadata(path: typeof MARKETING_SITEMAP_PATHS[number]): Metadata {
  return {
    alternates: { canonical: `${MARKETING_ORIGIN}${path}` },
    robots: { index: isMarketingIndexingEnabled(), follow: isMarketingIndexingEnabled() },
  };
}
