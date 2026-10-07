# Public guide article architecture (phase 2)

## Dependency and scope

This draft stacks on #1246, `fix/public-seo-crawlers-20261007`, exact base commit `9b93f262a7c7e4d98f956a26c1d2a42d9f168341`. Phase 1 crawler fixes are a dependency, not duplicated phase 2 work. Do not merge either branch or deploy without separate authorization.

- `/guides` is a categorized, compact article index using the existing marketing navigation, brand, and footer.
- `src/lib/public-guides.ts` is the single editorial source. The nine existing guides retain their IDs, category, title, summary, three steps, examples, note and feature link unchanged.
- Each published guide has a public, server-rendered `/guides/[slug]`, specific title/description/H1/canonical, body, feature link and return link.
- This editorial collection is separate from authenticated operation manuals. No dashboard, tenant, HQ, LIFF, OAuth, or database authorization is changed.
- JSON-LD describes Article and BreadcrumbList. No publication date, author, customer outcome or search-volume claim is invented.

## Publication state

`published` articles appear in the production index and sitemap. The approved music article (`music-school-leave-makeup-lesson-balance`) remains `draft`. Production returns 404 for it, omits it from the index and sitemap, and cannot reveal it via `?guide=`. Local development/test and explicitly isolated preview environments can render it with a draft label and noindex metadata. Unknown environments fail closed for drafts. Both index and article routes are force-dynamic so the state is evaluated at request time.

The new draft exactly preserves the user-reviewed body. The page separately identifies four-/eight-lesson scenarios as anonymous examples rather than a real classroom's policy. Its CTA points to `https://www.steamfoot.com/apply`. Shared trial-retention copy explains 30-day trial expiry, read-only access, and 30-day retention; it does not promise permanent storage.

Changing the status to `published` is a separate editorial release. Future article topics require demand validation before writing; this first knowledge article has no validated search-volume or ranking guarantee.

## Compatibility and boundary behavior

- Original category IDs (`guides-booking`, `guides-customers`, `guides-operations`), `guide-list`, and all nine article IDs remain in the index.
- Known `?guide=ID` links receive a real 308 to the article URL. Extra query strings are discarded, including UTM attribution; preserving campaign parameters is not claimed. Repeated or unknown guide values remain on the index.
- The article retains `id=ID`, preserving an inherited `#ID` fragment through the redirect. Return links point to `/guides#ID`.
- A single `/guides/{segment}` is resolved against the explicit visible-content registry before rendering. Unknown or unpublished slugs receive a real HTTP 404 and noindex. Nested/private paths are not included in this exception.
- The proxy resolves 404 and legacy 308 before Next streaming begins. Relying on the page's `notFound()`/`permanentRedirect()` alone produced HTTP 200 during live local verification, so page-level checks remain defense in depth rather than the HTTP-status boundary.
- Legacy `/pricing/guides/{slug}` aliases redirect to canonical paths. Existing store-specific home, auth, LIFF and OAuth routing remains unchanged.
- Public sitemap/robots use only the nine published article URLs from the registry, without query strings, draft URLs, operation manuals or private paths.

## Deployment isolation

Before creating the remote review branch, its initial commit includes:

1. `vercel.json` automatic deployment disabled for `feat/public-guide-articles-20261007`.
2. Fail-closed guards at the start of `scripts/ci-migrate.mjs` and `next.config.ts`, ahead of imports, migrations and builds, for Vercel, Workers CI and Cloudflare Pages branch variables.
3. Existing phase 1 and unrelated guards preserved.

No provider settings, credentials, project references, production databases, migrations, seeds, builds that access a database, or deployments are part of this task. CI is enabled for the stacked base branch and includes guide/crawler/routing regression tests.

## Verification and limits

- Focused server-rendered component, metadata, draft isolation, legacy URL, routing, sitemap/robots and branch-guard tests pass (75 tests across three suites).
- Exact source comparison confirms all nine original bodies are unchanged and reconstructing the music draft reproduces the approved final text exactly.
- Changed TypeScript/TSX ESLint and `git diff --check` pass.
- Real local Next HTTP verification uses synthetic non-connectable database URLs only; no database call is needed by article content. Final live local checks passed in both preview and production modes: index/article HTTP 200, unknown and uppercase slug HTTP 404, old query HTTP 308 without token leakage, duplicate query stays on index, SSR title/body/JSON-LD/return-anchor, production canonical/index, preview noindex, draft HTTP 200 only in preview and HTTP 404 in production, draft absent from production index and sitemap, and exactly 22 published sitemap URLs (13 original plus nine articles). Initial live verification found and corrected the streaming soft-404/redirect issue.
- Local full typecheck was attempted sequentially and terminated by the environment with exit 137; this is not a pass. Exact-head remote CI is required and reported separately.
- Visual desktop/mobile QA is incomplete. The cloud browser rejected localhost with `ERR_BLOCKED_BY_CLIENT`; no alternate browser route or deployment was used to bypass that restriction. No screenshots, real-device, Safari, desktop/phone interaction, history/back, or overflow pass is claimed. Required visual sizes remain 360/390 px phone and desktop, with long-article, menu, return-link and history checks.
- Full local Vitest: 7,205 passed, 119 skipped; 844 files passed and 16 skipped, exit 0. Final HTTP-boundary refinements are additionally covered by the final focused rerun. Exact-head CI outcomes are recorded in the draft PR when completed. A draft review does not establish release readiness.
