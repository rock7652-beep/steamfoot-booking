import { isCanonicalMarketingRequest, MARKETING_ORIGIN, MARKETING_SITEMAP_PATHS } from "@/lib/marketing-seo";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const paths = isCanonicalMarketingRequest(request) ? MARKETING_SITEMAP_PATHS : [];
  const urls = paths.map(path => `  <url><loc>${MARKETING_ORIGIN}${path}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
