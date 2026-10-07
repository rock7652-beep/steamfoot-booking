import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { PUBLIC_GUIDES, PUBLISHED_GUIDE_PATHS, GUIDE_CATEGORIES, findPublicGuide, guidePath, visiblePublicGuides } from "@/lib/public-guides";
import GuideIndex from "@/app/pricing/guides/page";
import GuideArticle, { generateMetadata } from "@/app/pricing/guides/[slug]/page";
import { GET as sitemap } from "@/app/sitemap.xml/route";
import { GET as robots } from "@/app/robots.txt/route";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import { proxy } from "@/proxy";

const draftSlug = "music-school-leave-makeup-lesson-balance";
const props = (slug: string) => ({ params: Promise.resolve({ slug }) });
const route = (path: string, host = "www.steamfoot.com") => {
  const req = new NextRequest(`https://${host}${path}`, { headers: { host } });
  Object.assign(req, { auth: null });
  return (proxy as unknown as (req: NextRequest) => Response)(req);
};
afterEach(() => vi.unstubAllEnvs());

describe("public editorial guides", () => {
  it("preserves the nine original IDs, category anchors, and complete short content", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const originalIds = ["solo-store", "opening-checklist", "trial-booking", "arrival-reminder", "plan-expiry", "trial-follow-up", "closing-cash", "stock-check", "work-order-handoff"];
    expect(visiblePublicGuides().map(guide => guide.id)).toEqual(originalIds);
    expect(new Set(PUBLIC_GUIDES.map(guide => guide.id)).size).toBe(PUBLIC_GUIDES.length);
    const index = renderToStaticMarkup(await GuideIndex({ searchParams: Promise.resolve({}) }));
    for (const category of GUIDE_CATEGORIES) expect(index).toContain(`id="guides-${category.id}"`);
    expect(index).toContain('id="guide-list"');
    for (const guide of visiblePublicGuides()) {
      expect(index).toContain(`id="${guide.id}"`);
      expect(index).toContain(`href="${guidePath(guide)}"`);
      expect(index).toContain(guide.summary);
      const article = renderToStaticMarkup(await GuideArticle(props(guide.id)));
      expect(article).toContain(guide.title);
      expect(article).toContain(`<article id="${guide.id}"`);
      expect(article.match(/<h1\b/g)).toHaveLength(1);
      expect(article).toContain(`href="/guides#${guide.id}"`);
      if (guide.format === "short") {
        expect(guide.steps).toHaveLength(3);
        for (const step of guide.steps) { expect(article).toContain(step); expect(index).not.toContain(step); }
        for (const pair of guide.example) for (const text of pair) expect(article).toContain(text);
        expect(article).toContain(guide.note);
        expect(article).toContain(`/pricing/features#${guide.feature}`);
      }
    }
  });

  it.each(PUBLIC_GUIDES.filter(guide => guide.status === "published"))("redirects legacy query $id without copying query tokens", async guide => {
    const response = route(`/guides?guide=${guide.id}&token=discard`);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`https://www.steamfoot.com${guidePath(guide)}`);
    await expect(GuideIndex({ searchParams: Promise.resolve({ guide: guide.id }) })).rejects.toMatchObject({ digest: `NEXT_REDIRECT;replace;${guidePath(guide)};308;` });
  });

  it("keeps unknown and repeated query values on the clean index", async () => {
    for (const guide of ["missing", ["solo-store", "closing-cash"]]) {
      const query = Array.isArray(guide) ? "guide=solo-store&guide=closing-cash" : "guide=missing";
      expect(route(`/guides?${query}`).headers.get("location")).toBeNull();
      const html = renderToStaticMarkup(await GuideIndex({ searchParams: Promise.resolve({ guide }) }));
      expect(html).toContain('id="guide-list"');
    }
  });

  it("returns the Next 404 boundary for unknown article slugs and unapproved production drafts", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const slug of ["missing", "private", "constructor", "UPPERCASE", "with_underscore", draftSlug]) {
      expect(findPublicGuide(slug)).toBeUndefined();
      expect(route(`/guides/${slug}`).status).toBe(404);
      await expect(GuideArticle(props(slug))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
      await expect(generateMetadata(props(slug))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    }
  });

  it("renders the approved music draft for review with anonymous examples and bounded retention", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const html = renderToStaticMarkup(await GuideArticle(props(draftSlug)));
    const guide = findPublicGuide(draftSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    for (const paragraph of [...guide.introduction, ...guide.sections.flatMap(section => [...section.paragraphs, ...(section.bullets ?? [])]), guide.conclusion, guide.callToAction.text]) expect(html).toContain(paragraph);
    expect(html).toContain("校閱草稿，尚未發布");
    expect(html).toContain("四堂與八堂均為匿名示例");
    expect(html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1]).not.toContain("陸比");
    expect(html).toContain("試用到期後後台改為唯讀，資料保留 30 天");
    expect(html).toContain('href="https://www.steamfoot.com/apply"');
    expect(html).toContain('href="/pricing/features/music"');
    expect((await generateMetadata(props(draftSlug))).robots).toEqual({ index: false, follow: false });
  });

  it("uses per-article canonical, metadata, and truthful structured data without invented authors/dates", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const guide of visiblePublicGuides()) {
      const metadata = await generateMetadata(props(guide.id));
      expect(metadata.title).toBe(`${guide.title}｜蒸管家經營指南`);
      expect(metadata.description).toBe(guide.summary);
      expect(metadata.alternates?.canonical).toBe(`https://www.steamfoot.com${guidePath(guide)}`);
      expect(metadata.robots).toEqual({ index: true, follow: true });
      const html = renderToStaticMarkup(await GuideArticle(props(guide.id)));
      const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)![1]);
      expect(schema["@graph"][0]).toMatchObject({ "@type": "Article", headline: guide.title });
      expect(schema["@graph"][1].itemListElement[2].item).toBe(`https://www.steamfoot.com${guidePath(guide)}`);
      expect(schema["@graph"][0]).not.toHaveProperty("author");
      expect(schema["@graph"][0]).not.toHaveProperty("datePublished");
      expect(schema["@graph"][0]).not.toHaveProperty("dateModified");
    }
  });

  it("advertises only published public article URLs and no drafts, tokens, or private manuals", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const xml = await sitemap(new Request("https://www.steamfoot.com/sitemap.xml?token=secret")).text();
    const rules = await robots(new Request("https://www.steamfoot.com/robots.txt")).text();
    expect(PUBLISHED_GUIDE_PATHS).toHaveLength(9);
    for (const path of PUBLISHED_GUIDE_PATHS) {
      expect(xml).toContain(`<loc>https://www.steamfoot.com${path}</loc>`);
      expect(rules).toContain(`Allow: ${path}$\n`);
    }
    expect(xml).not.toMatch(/music-school|token|hq|dashboard|operation-guide/);
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].every(match => !match[1].includes("?"))).toBe(true);
    expect(rules).not.toContain(draftSlug);
  });

  it("supports a single public slug without granting access to private route families", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = route("/guides/solo-store?utm_source=guide");
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://www.steamfoot.com/pricing/guides/solo-store?utm_source=guide");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(route("/pricing/guides/solo-store").headers.get("location")).toBe("https://www.steamfoot.com/guides/solo-store");
    for (const path of ["/guides/private/admin", "/guides-api/solo-store", "/guides/../hq/dashboard", "/hq/dashboard/guide", "/s/zhubei/admin/dashboard/guide"]) expect(route(path).headers.get("location")).toBeTruthy();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(route("/guides/solo-store").headers.get("x-robots-tag")).toBeNull();
    expect(route("/guides/solo-store", "example.vercel.app").headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(route("/guides/solo-store", "steamfoot-zhubei.com").headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const customLegacy = route("/guides?guide=solo-store&utm_source=line&token=discard", "steamfoot-zhubei.com");
    expect(customLegacy.status).toBe(308);
    expect(customLegacy.headers.get("location")).toBe("https://steamfoot-zhubei.com/guides/solo-store");
    expect(customLegacy.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("fails closed before migrations and builds on both review branches and provider environments", () => {
    for (const branch of ["fix/public-seo-crawlers-20261007"]) {
      expect(JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled[branch]).toBe(false);
      for (const file of ["scripts/ci-migrate.mjs", "next.config.ts"]) {
        const source = readFileSync(file, "utf8");
        const guard = new Function("process", source.slice(0, source.indexOf("import ")));
        for (const key of ["VERCEL_GIT_COMMIT_REF", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"]) expect(() => guard({ env: { [key]: branch } })).toThrow(/review branch deployment is disabled/);
        expect(() => guard({ env: { VERCEL_GIT_COMMIT_REF: "main" } })).not.toThrow();
      }
    }
  });
});
