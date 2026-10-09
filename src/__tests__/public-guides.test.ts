import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { PublicGuide } from "@/lib/public-guides";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { PUBLIC_GUIDES, PUBLISHED_GUIDE_PATHS, GUIDE_CATEGORIES, findPublicGuide, guidePath, visiblePublicGuides } from "@/lib/public-guides";
import GuideIndex from "@/app/pricing/guides/page";
import GuideArticle, { generateMetadata } from "@/app/pricing/guides/[slug]/page";
import { GET as sitemap } from "@/app/sitemap.xml/route";
import { GET as robots } from "@/app/robots.txt/route";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import { proxy } from "@/proxy";

const migrationSlug = "music-school-system-data-migration";
const waitlistSlug = "yoga-studio-waitlist-order";
const musicSlug = "music-school-leave-makeup-lesson-balance";
const props = (slug: string) => ({ params: Promise.resolve({ slug }) });
const route = (path: string, host = "www.steamfoot.com") => {
  const req = new NextRequest(`https://${host}${path}`, { headers: { host } });
  Object.assign(req, { auth: null });
  return (proxy as unknown as (req: NextRequest) => Response)(req);
};
afterEach(() => vi.unstubAllEnvs());

describe("public editorial guides", () => {
  it("preserves the ten original IDs, category anchors, and article index links", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const originalIds = ["solo-store", "opening-checklist", "trial-booking", "arrival-reminder", "plan-expiry", "trial-follow-up", "closing-cash", "stock-check", "work-order-handoff"];
    expect(visiblePublicGuides().map(guide => guide.id)).toEqual([...originalIds, musicSlug, waitlistSlug, migrationSlug]);
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

  it("returns the Next 404 boundary for unknown article slugs", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const slug of ["missing", "private", "constructor", "UPPERCASE", "with_underscore"]) {
      expect(findPublicGuide(slug)).toBeUndefined();
      expect(route(`/guides/${slug}`).status).toBe(404);
      await expect(GuideArticle(props(slug))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
      await expect(generateMetadata(props(slug))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    }
  });

  it("renders every approved article verbatim, in order, with the disclosure directly below its title", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    // Content-only locks preserve the approved manuscripts independently of routing metadata.
    const approved: Record<string, { keys: string[]; sha256: string }> = {
      "solo-store": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "b6b36f2cabcbba625b5f99c8b58bc9e3da5cf116c77a2825719f8d1e5eb41add"
      },
      "opening-checklist": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "97749cf309409533837b631e93bd5f1d696b1f2eb0aee92c72256cd8a4d7a027"
      },
      "trial-booking": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "66772aec47f1939e83133dbaafd9b60a07ce78e5819f2c8d7dfa2d077775f85d"
      },
      "arrival-reminder": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "5b319f2bf275bb8fdd4fc913eddba5cfb931f223927dd4eadc8ac4ef89cae982"
      },
      "plan-expiry": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "c05d6a15732be9e1a778ba767d6eb0c10a182e8a023d81ce8b6f43d97a7d5f51"
      },
      "trial-follow-up": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "491c51db9bd603177591b2b8ec0587b6705b834a6308ef4624c471b101b8a61d"
      },
      "closing-cash": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "e3ea95f2d41b4c11d6f0a2ad31f8fcb6715c56b3ccdd3206dd3bd70808259809"
      },
      "stock-check": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "2cfcf404b97cea1ddc18b180a289da5b7750a9e204b4e6980f9a6e765467ba56"
      },
      "work-order-handoff": {
            "keys": [
                  "id",
                  "title",
                  "summary",
                  "introduction",
                  "sections",
                  "conclusion",
                  "callToAction",
                  "disclosure"
            ],
            "sha256": "9925b9aaad33a839eee4c424462ca406813fee170f4a298e6b26eb9bc2933161"
      },
      "music-school-leave-makeup-lesson-balance": {
            "keys": [
                  "id",
                  "title",
                  "disclosure",
                  "introduction",
                  "sections",
                  "callToAction"
            ],
            "sha256": "917854ae13720809901a8a6e0c7b1ebf5e73d860c3d5fd4a10ab8d9afe9b983e"
      }
};
    expect(Object.keys(approved)).toHaveLength(10);
    for (const guide of visiblePublicGuides().filter(guide => guide.id !== waitlistSlug && guide.id !== migrationSlug)) {
      expect(guide.format).toBe("article");
      if (guide.format !== "article") continue;
      const lock = approved[guide.id];
      const content = Object.fromEntries(lock.keys.map(key => [key, guide[key as keyof typeof guide]]));
      expect(createHash("sha256").update(JSON.stringify(content)).digest("hex")).toBe(lock.sha256);
      const html = renderToStaticMarkup(await GuideArticle(props(guide.id)));
      const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
      expect(article).toMatch(/<\/h1><p class="mt-3 text-sm leading-6 text-\[#4C6259\]">以下情境取材自門市常見困擾，人物與對話為示意，非特定店家的個案紀錄。<\/p>/);
      const ordered = [guide.title, guide.disclosure!, ...(guide.showSummary === false ? [] : [guide.summary]), ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]), ...(guide.conclusion ? [guide.conclusion] : []), ...(guide.callToAction.heading ? [guide.callToAction.heading] : []), guide.callToAction.text];
      let cursor = 0;
      for (const text of ordered) {
        const position = article.indexOf(text, cursor);
        expect(position, text).toBeGreaterThanOrEqual(cursor);
        cursor = position + text.length;
      }
      expect(article).not.toMatch(/內文改寫校稿版|全文校稿版|待使用者校稿|校閱草稿|常見問答|四堂與八堂均為匿名示例/);
      expect(article).toContain("保留期間轉正式可沿用原帳號與試用資料");
      expect(article).toContain('href="https://www.steamfoot.com/apply"');
      expect(guide.status).toBe("published");
      expect(route(`/guides/${guide.id}`).status).toBe(200);
      expect(route(`/guides/${guide.id}`).headers.get("x-robots-tag")).toBeNull();
      expect(html).toContain(guide.id === musicSlug ? 'href="/pricing/features/music"' : `href="/pricing/features#${guide.feature}"`);
      if (guide.id === musicSlug) {
        expect(guide.conclusion).toBeUndefined();
        expect(guide.showSummary).toBe(false);
        expect(article).not.toContain(guide.summary);
      } else {
        expect(guide.conclusion).toBeTruthy();
        expect(article).toContain(guide.summary);
      }
    }
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(musicSlug))).robots).toEqual({ index: false, follow: false });
  });

  it("publishes only the approved waitlist article body, disclaimer and conditional trial CTA", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const guide = findPublicGuide(waitlistSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    // Source: the approved waitlist article, excluding its research report and source appendix.
    expect(createHash("sha256").update(JSON.stringify(guide)).digest("hex")).toBe("d35b30350925e88d355f57c29e989d891191146595f491386ca993f9c4dbc21f");
    const html = renderToStaticMarkup(await GuideArticle(props(waitlistSlug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    const ordered = [guide.title, guide.disclosure!, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs]), ...(guide.callToAction.heading ? [guide.callToAction.heading] : []), guide.callToAction.text];
    let cursor = 0;
    for (const text of ordered) {
      const position = article.indexOf(text, cursor);
      expect(position, text).toBeGreaterThanOrEqual(cursor);
      cursor = position + text.length;
    }
    expect(guide.showSummary).toBe(false);
    expect(guide.conclusion).toBeUndefined();
    expect(article).not.toContain(guide.summary);
    expect(article).not.toMatch(/文章校稿|查核來源|選題查核|Keyword Planner|Search Console|Le Gin|FitBook|VibeAI|高搜尋量|校閱草稿/);
    expect(article).toContain("人物與對話為示意，非特定店家的個案紀錄");
    expect(article).toContain("需啟用候補並完成 LINE 串接");
    expect(article).toContain("從帳號可正常使用並正式開通當日起算");
    expect(article).toContain("保留期間轉正式可沿用原帳號與試用資料");
    expect(article).toContain("試用到期後資料保留 30 天");
    expect(article).toContain('href="https://www.steamfoot.com/apply"');
    expect(html).toContain('href="/pricing/features#waitlist"');
    expect(route(`/guides/${waitlistSlug}`).status).toBe(200);
    expect(route(`/guides/${waitlistSlug}`).headers.get("x-robots-tag")).toBeNull();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(waitlistSlug))).robots).toEqual({ index: false, follow: false });
  });

  it("publishes the approved five-step migration manuscript with one article CTA", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const guide = findPublicGuide(migrationSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    const manuscript = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs]), guide.callToAction.text, `${guide.callToAction.label}\n${guide.callToAction.url}`].join("\n\n") + "\n";
    // Exact UTF-8 approved five-step manuscript, without the private SEO research appendix.
    expect(createHash("sha256").update(manuscript).digest("hex")).toBe("7e72835d56b2dfc951f05145da5d611d79b6a4db6004e013e2e963d38e52008d");
    expect(guide.sections).toHaveLength(5);
    expect(guide.showSummary).toBe(false);
    const html = renderToStaticMarkup(await GuideArticle(props(migrationSlug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    expect(article.match(/href="https:\/\/www\.steamfoot\.com\/apply"/g)).toHaveLength(1);
    expect(article).toContain("前往蒸管家，了解體驗與導入範圍");
    expect(article).not.toContain(guide.summary);
    expect(article).not.toContain("申請免費試用 30 天");
    expect(article).not.toMatch(/搜尋量|SEO|熱門搜尋|自動搬家|無痛|永久保留/);
    expect(html).toContain('href="/pricing/features/music"');
    expect(route(`/guides/${migrationSlug}`).status).toBe(200);
    expect(route(`/guides/${migrationSlug}`).headers.get("x-robots-tag")).toBeNull();
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${migrationSlug}`);
    const index = renderToStaticMarkup(await GuideIndex({ searchParams: Promise.resolve({}) }));
    expect(index).toContain(`href="/guides/${migrationSlug}"`);
    expect(index).toContain(guide.summary);
    for (const previous of visiblePublicGuides().filter(item => item.id !== migrationSlug)) {
      const previousHtml = renderToStaticMarkup(await GuideArticle(props(previous.id)));
      expect(previousHtml).toContain("申請免費試用 30 天 →");
      expect(previousHtml).not.toContain("前往蒸管家，了解體驗與導入範圍");
    }
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(migrationSlug))).robots).toEqual({ index: false, follow: false });
  });

  it("keeps a future unpublished fixture private without treating the published music article as draft", async () => {
    const fixture: PublicGuide = { ...PUBLIC_GUIDES[0], id: "unpublished-test-fixture", status: "draft" };
    const registry = PUBLIC_GUIDES as PublicGuide[];
    registry.push(fixture);
    try {
      vi.stubEnv("VERCEL_ENV", "production");
      expect(findPublicGuide(fixture.id)).toBeUndefined();
      expect(route(`/guides/${fixture.id}`).status).toBe(404);
      await expect(GuideArticle(props(fixture.id))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
      await expect(generateMetadata(props(fixture.id))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
      // Sitemap paths are initialized before this runtime fixture is inserted.
      // Keep the published-only initialization contract independently covered.
      expect(readFileSync("src/lib/public-guides.ts", "utf8")).toContain('PUBLIC_GUIDES.filter(guide => guide.status === "published").map(guidePath)');
      const index = renderToStaticMarkup(await GuideIndex({ searchParams: Promise.resolve({}) }));
      expect(index).not.toContain(fixture.id);
      expect(await sitemap(new Request("https://www.steamfoot.com/sitemap.xml")).text()).not.toContain(fixture.id);
      vi.stubEnv("VERCEL_ENV", "preview");
      expect(findPublicGuide(fixture.id)).toBe(fixture);
      expect((await generateMetadata(props(fixture.id))).robots).toEqual({ index: false, follow: false });
    } finally {
      registry.splice(registry.indexOf(fixture), 1);
    }
  });

  it("keeps this publication-only branch from auto-deploying a new Preview", () => {
    const deployment = JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled;
    expect(deployment["fix/publish-music-guide-20261008"]).toBe(false);
    expect(deployment["content/yoga-waitlist-management"]).toBe(false);
    expect(deployment.main).toBeUndefined();
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
    expect(PUBLISHED_GUIDE_PATHS).toHaveLength(12);
    expect([...xml.matchAll(/<loc>/g)]).toHaveLength(25);
    for (const path of PUBLISHED_GUIDE_PATHS) {
      expect(xml).toContain(`<loc>https://www.steamfoot.com${path}</loc>`);
      expect(rules).toContain(`Allow: ${path}$\n`);
    }
    expect(xml).not.toMatch(/token|hq|dashboard|operation-guide/);
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].every(match => !match[1].includes("?"))).toBe(true);
    expect(rules).toContain(`Allow: /guides/${musicSlug}$`);
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
    for (const branch of ["fix/public-seo-crawlers-20261007", "content/approved-business-guides-20261008"]) {
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
