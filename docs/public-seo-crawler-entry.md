# Public marketing crawler entry

Phase 1 repairs crawler documents and marketing indexing metadata only. It does
not publish article routes, change authentication, alter tenant data, or migrate
a database.

- `/robots.txt` and `/sitemap.xml` are exact matcher exclusions and dynamic Route
  Handlers. Similar prefixes and nested paths still go through the existing proxy.
- Only `VERCEL_ENV=production` and Host `www.steamfoot.com` publish the corporate
  sitemap. The origin is fixed public marketing identity, not an auth URL fallback.
  Next can provide an internal request URL, so Host is checked but never reflected.
- The sitemap explicitly lists 13 existing marketing/legal destinations. Redirect
  aliases, member/HQ/API/LIFF/token/preview/store-specific pages are excluded.
- Robots uses an exact public allowlist, including rendering assets and legacy
  aliases so crawlers can observe their canonical 308 redirects. It is crawl
  guidance, not access control. Existing authorization remains authoritative.
- Marketing pages declare canonical URLs. The homepage's former unconditional
  noindex is replaced by production-only indexing. Private/root/store layouts
  are unchanged. Noncanonical marketing hosts retain noindex responses.
- Preview deployments get `X-Robots-Tag: noindex, nofollow` globally, including
  static HTML. Preview/unknown/custom-host crawler documents never advertise
  corporate URLs, and responses are not shared across hosts.

## Publication safety

The review branch `fix/public-seo-crawlers-20261007` has automatic Vercel deployment
explicitly disabled. Both build entrypoints fail closed for that exact branch
before running migration/build logic, including Vercel and Cloudflare branch
identifiers. This does not block main or other branches.
No Preview deployment or production merge is part of this change. Deployment
verification needs separate approval; local tests do not constitute deployed QA.

## Verification

Focused tests exercise the real Next matcher utility, document handlers, proxy
routes, canonical allowlist/files, environment/host boundaries and deployment
guards. Local HTTP verification uses synthetic unreachable database URLs and
never seeds or calls migration scripts. Full-suite, typecheck and lint outcomes
are recorded in the PR; no environment credentials belong in this document.
