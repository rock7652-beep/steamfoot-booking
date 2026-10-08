import { MARKETING_LEGACY_PATHS } from "@/lib/marketing-routes";
import { isCanonicalMarketingRequest, MARKETING_ORIGIN, MARKETING_SITEMAP_PATHS } from "@/lib/marketing-seo";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const indexable = isCanonicalMarketingRequest(request);
  // An exact public allowlist keeps tenant, token, API and preview routes out.
  // Robots directives are crawl hints, never a replacement for authorization.
  const rules = indexable
    ? ["User-agent: *", "Disallow: /", "Allow: /sitemap.xml$", ...[...MARKETING_SITEMAP_PATHS, ...MARKETING_LEGACY_PATHS].map(path => `Allow: ${path}$`), "Allow: /_next/static/", "Allow: /_next/image", "Allow: /pricing/business-assets/", "Allow: /pricing/brand/", `Sitemap: ${MARKETING_ORIGIN}/sitemap.xml`]
    : ["User-agent: *", "Disallow: /"];
  return new Response(`${rules.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
