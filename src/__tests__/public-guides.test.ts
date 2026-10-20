// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MarketingStickyOffer } from "@/components/marketing-sticky-offer";
import editorialGuides from "@/content/editorial-guides.json";
vi.mock("@/lib/retired-store-boundary", () => ({ retiredStoreBoundary: () => null }));
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { GuideParagraph, PublicGuide } from "@/lib/public-guides";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { PUBLIC_GUIDES, PUBLISHED_GUIDE_PATHS, GUIDE_CATEGORIES, findPublicGuide, guidePath, visiblePublicGuides } from "@/lib/public-guides";
import GuideIndex from "@/app/pricing/guides/page";
import GuideArticle, { generateMetadata } from "@/app/pricing/guides/[slug]/page";
import { GET as sitemap } from "@/app/sitemap.xml/route";
import { GET as robots } from "@/app/robots.txt/route";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import { proxy } from "@/proxy";

const permissionsSlug = "music-school-remote-management-role-permissions";
const handoverSlug = "fitness-studio-substitute-teacher-handover";
const renewalSlug = "music-school-renewal-confirmation";
const teacherFeeSlug = "music-school-teacher-fee-reconciliation";
const pilatesSlug = "pilates-studio-equipment-scheduling";
const notificationSlug = "music-school-leave-reschedule-notifications";
const waitlistSlug = "yoga-studio-waitlist-order";
const musicSlug = "music-school-leave-makeup-lesson-balance";
const props = (slug: string) => ({ params: Promise.resolve({ slug }) });
const paragraphText = (paragraph: GuideParagraph) => typeof paragraph === "string" ? paragraph : paragraph.inlineParts.map(part => typeof part === "string" ? part : part.label).join("");
const route = (path: string, host = "www.steamfoot.com") => {
  const req = new NextRequest(`https://${host}${path}`, { headers: { host } });
  Object.assign(req, { auth: null });
  return (proxy as unknown as (req: NextRequest) => Response)(req);
};
afterEach(() => vi.unstubAllEnvs());

describe("public editorial guides", () => {
  it("preserves the complete approved referral v5, body links and trial CTA", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const slug = "fitness-studio-member-referral-handoff";
    const guide = findPublicGuide(slug)!;
    if (guide.format !== "article") throw new Error("Expected article");
    const cta = paragraphText({ inlineParts: guide.callToAction.inlineParts! });
    const ordered = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText), ...(section.bullets ?? []), ...(section.trailingParagraphs ?? [])]), cta];
    expect(createHash("sha256").update(ordered.join("\n\n") + "\n").digest("hex")).toBe("4b17800badcd6436441580cbafc0336089291267d91155c7fc99d91ec11039f2");
    const html = renderToStaticMarkup(await GuideArticle(props(slug)));
    const container = document.createElement("div");
    container.innerHTML = html;
    const article = container.querySelector("article")!;
    expect(article.querySelectorAll("h2")).toHaveLength(7);
    expect(article.querySelectorAll("li")).toHaveLength(5);
    expect([...article.querySelectorAll("a")].map(link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["顧客管理功能", "https://www.steamfoot.com/pricing/features"],
      ["運動教室管理功能", "https://www.steamfoot.com/pricing/features/fitness"],
      ["申請蒸管家30天免費試用", "https://www.steamfoot.com/apply"],
      ["申請頁", "https://www.steamfoot.com/apply"],
      ["方案說明", "https://www.steamfoot.com/pricing"],
    ]);
    expect([...article.querySelectorAll('a[href="https://www.steamfoot.com/apply"]')].every(link => link.getAttribute("target") === "_top")).toBe(true);
    expect(article.textContent).not.toMatch(/\[object Object\]|SEO 工作表|校稿備註/);
    expect(html).toContain('"datePublished":"2026-10-19"');
    expect((await generateMetadata(props(slug))).alternates?.canonical).toBe(`https://www.steamfoot.com/guides/${slug}`);
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${slug}`);
  });
  it("preserves the approved holiday closure article and inline trial links", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const slug = "music-school-holiday-closure-checklist";
    const guide = findPublicGuide(slug)!;
    if (guide.format !== "article") throw new Error("Expected article");
    const cta = guide.callToAction.inlineParts!.map(part => typeof part === "string" ? part : part.label).join("");
    const ordered = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), cta];
    expect(createHash("sha256").update(ordered.join("\n\n") + "\n").digest("hex")).toBe("8490d63329e94d03c9f6a18cadeb142934bd3220e56db5a43c7e372828010042");
    const html = renderToStaticMarkup(await GuideArticle(props(slug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    expect(article.match(/<h1\b/g)).toHaveLength(1);
    expect(article.match(/<h2\b/g)).toHaveLength(3);
    expect(article).toContain('href="https://www.steamfoot.com/pricing#trial-details"');
    expect(article.match(/href="https:\/\/www.steamfoot.com\/apply"/g)).toHaveLength(1);
    expect(html).toContain('href="/pricing/features/music"');
    expect(html).toContain(`href="/guides#${slug}"`);
    expect(article).not.toMatch(/校稿備註|SEO 工作表|校閱草稿|永久保留/);
    const metadata = await generateMetadata(props(slug));
    expect(metadata.title).toBe(guide.title);
    expect(metadata.description).toBe(guide.summary);
    expect(metadata.alternates?.canonical).toBe(`https://www.steamfoot.com/guides/${slug}`);
    expect(html).toContain('"datePublished":"2026-10-18"');
    expect(route(`/guides/${slug}`).status).toBe(200);
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${slug}`);
  });


  it("lets the holiday article trial CTA navigate without opening the preview form", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const article = document.createElement("div");
    article.innerHTML = renderToStaticMarkup(await GuideArticle(props("music-school-holiday-closure-checklist")));
    const host = document.createElement("div");
    document.body.append(article, host);
    const root = createRoot(host);
    const showModal = vi.fn();
    try {
      await act(async () => root.render(createElement(MarketingStickyOffer)));
      Object.defineProperty(host.querySelector("dialog")!, "showModal", { value: showModal });
      const link = article.querySelector<HTMLAnchorElement>('article a[href="https://www.steamfoot.com/apply"]')!;
      expect(link.target).toBe("_top");
      let intercepted: boolean | undefined;
      // Observe after the real document capture handler, then stop jsdom navigation.
      link.addEventListener("click", event => { intercepted = event.defaultPrevented; event.preventDefault(); });
      await act(async () => { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
      expect(intercepted).toBe(false);
      expect(showModal).not.toHaveBeenCalled();
      expect(host.querySelector("iframe")).toBeNull();
      // The existing modal behavior remains enabled for ordinary marketing links.
      link.removeAttribute("target");
      await act(async () => { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
      expect(showModal).toHaveBeenCalledOnce();
      expect(host.querySelector("iframe")?.getAttribute("src")).toBe("/apply?intent=trial&embedded=1");
    } finally {
      await act(async () => root.unmount());
      article.remove(); host.remove(); vi.unstubAllGlobals();
    }
  });

  it("preserves the approved paid attendance Word body and uses the care CTA", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const slug = "paid-members-attendance-drop-follow-up";
    const guide = findPublicGuide(slug)!;
    if (guide.format !== "article") throw new Error("Expected article");
    const ordered = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.heading!, guide.callToAction.text];
    expect(createHash("sha256").update(ordered.join("\n")).digest("hex")).toBe("5b736a971b6794c010067b849832eb70d4c18fe66c523fb3a8342d6de8218606");
    const html = renderToStaticMarkup(await GuideArticle(props(slug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    let cursor = 0;
    for (const text of ordered) {
      const position = article.indexOf(text, cursor);
      expect(position, text).toBeGreaterThanOrEqual(cursor);
      cursor = position + text.length;
    }
    expect(article.match(/<h1/g)).toHaveLength(1);
    expect(article.match(/<h2/g)).toHaveLength(4);
    expect(article).toContain('href="https://www.steamfoot.com/pricing/features#care"');
    expect(article).not.toContain('href="https://www.steamfoot.com/apply"');
    expect(article).not.toMatch(/SEO 選題與校稿資料|待核定，不發布|證據強度與搜尋量限制|永久保留/);
    const metadata = await generateMetadata(props(slug));
    expect(metadata.title).toBe(guide.title);
    expect(metadata.description).toBe(guide.summary);
    expect(metadata.keywords).toEqual(["運動教室舊客回訪管理"]);
    expect(metadata.alternates?.canonical).toBe(`https://www.steamfoot.com/guides/${slug}`);
    expect(route(`/guides/${slug}`).status).toBe(200);
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${slug}`);
    const xml = await sitemap(new Request("https://www.steamfoot.com/sitemap.xml")).text();
    expect(xml).toContain(`<loc>https://www.steamfoot.com/guides/${slug}</loc>`);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(slug))).robots).toEqual({ index: false, follow: false });
  });

  it("publishes the approved sports metrics manuscript with its definitions, example, SEO and CTA", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const slug = "sports-studio-business-metrics";
    const guide = findPublicGuide(slug)!;
    if (guide.format !== "article") throw new Error("Expected article");
    const ordered = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText), ...(section.bullets ?? []), ...(section.link ? [section.link.label] : []), ...(section.trailingParagraphs ?? [])]), guide.callToAction.text, guide.callToAction.label];
    expect(createHash("sha256").update(ordered.join("\n")).digest("hex")).toBe("a8ea94338e51fb15df33f4f152d226953805cff44370f62a66d937347155ac98");
    const html = renderToStaticMarkup(await GuideArticle(props(slug)));
    let last = -1;
    for (const text of ordered) { const position = html.indexOf(text!, last + 1); expect(position).toBeGreaterThan(last); last = position; }
    expect(html).toContain('href="https://www.steamfoot.com/pricing/features#analysis"');
    expect(html.match(/href="https:\/\/www\.steamfoot\.com\/apply"/g)).toHaveLength(1);
    expect(html).toContain('"datePublished":"2026-10-15"');
    expect(html).not.toMatch(/編輯附錄|永久保留/);
    const metadata = await generateMetadata(props(slug));
    expect(metadata.title).toBe(guide.seoTitle);
    expect(metadata.description).toBe(guide.summary);
    expect(metadata.keywords).toEqual(["運動教室營運分析"]);
    expect(metadata.alternates?.canonical).toBe(`https://www.steamfoot.com/guides/${slug}`);
    expect(route(`/guides/${slug}`).status).toBe(200);
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${slug}`);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(slug))).robots).toEqual({ index: false, follow: false });
  });

  it("preserves the approved permissions Word v2 body and excludes editorial appendices", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const guide = findPublicGuide(permissionsSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    const body = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.text, guide.callToAction.termsText].join("\n");
    expect(createHash("sha256").update(body).digest("hex")).toBe("1623ae6e1d084379313150000512e11f3d3f804b2a5f53e856c6f2c76e21da78");
    const html = renderToStaticMarkup(await GuideArticle(props(permissionsSlug)));
    expect(html).toContain("看得到營運，同事做得了事");
    expect(html).toContain('href="https://www.steamfoot.com/apply"');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toMatch(/編輯附錄|校稿問題|證據分級/);
    expect(route(`/guides/${permissionsSlug}`).status).toBe(200);
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${permissionsSlug}`);
  });

  it("publishes the approved student loyalty body, metadata and CTA without editorial appendices", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const slug = "music-fitness-studio-student-loyalty";
    const guide = findPublicGuide(slug)!;
    if (guide.format !== "article") throw new Error("Expected article");
    const ordered = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.label!];
    expect(createHash("sha256").update(ordered.join("\n")).digest("hex")).toBe("61326b589a008e6a5a67b4ea8b2de141809e503a075dc6529bcb2717ae3bdc16");
    const html = renderToStaticMarkup(await GuideArticle(props(slug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    let cursor = 0;
    for (const text of ordered) {
      const position = article.indexOf(text, cursor);
      expect(position, text).toBeGreaterThanOrEqual(cursor);
      cursor = position + text.length;
    }
    expect(article.match(/<h1/g)).toHaveLength(1);
    expect(article.match(/<h2/g)).toHaveLength(4);
    expect(article.match(/href="https:\/\/www.steamfoot.com\/apply"/g)).toHaveLength(1);
    expect(article).not.toMatch(/編輯附錄|校稿問題|證據分級|校閱草稿/);
    const metadata = await generateMetadata(props(slug));
    expect(metadata.title).toBe(guide.title);
    expect(metadata.description).toBe(guide.summary);
    expect(metadata.alternates?.canonical).toBe(`https://www.steamfoot.com/guides/${slug}`);
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${slug}`);
    expect(route(`/guides/${slug}`).status).toBe(200);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(slug))).robots).toEqual({ index: false, follow: false });
  });

  it("preserves the ten original IDs, category anchors, and article index links", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const originalIds = ["solo-store", "opening-checklist", "trial-booking", "arrival-reminder", "plan-expiry", "trial-follow-up", "closing-cash", "stock-check", "work-order-handoff"];
    expect(visiblePublicGuides().map(guide => guide.id)).toEqual([...originalIds, musicSlug, waitlistSlug, notificationSlug, pilatesSlug, teacherFeeSlug, renewalSlug, handoverSlug, permissionsSlug, "sports-studio-business-metrics", "music-fitness-studio-student-loyalty", "paid-members-attendance-drop-follow-up", ...editorialGuides.filter(guide => guide.status === "published").map(guide => guide.id)]);
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
    for (const guide of visiblePublicGuides().filter(guide => guide.id !== waitlistSlug && guide.id !== notificationSlug && guide.id !== pilatesSlug && guide.id !== teacherFeeSlug && guide.id !== renewalSlug && guide.id !== handoverSlug && guide.id !== permissionsSlug && guide.id !== "sports-studio-business-metrics" && guide.id !== "music-fitness-studio-student-loyalty" && guide.id !== "paid-members-attendance-drop-follow-up" && !editorialGuides.some(item => item.id === guide.id))) {
      expect(guide.format).toBe("article");
      if (guide.format !== "article") continue;
      const lock = approved[guide.id];
      const content = Object.fromEntries(lock.keys.map(key => [key, guide[key as keyof typeof guide]]));
      expect(createHash("sha256").update(JSON.stringify(content)).digest("hex")).toBe(lock.sha256);
      const html = renderToStaticMarkup(await GuideArticle(props(guide.id)));
      const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
      expect(article).toMatch(/<\/h1><p class="mt-3 text-sm leading-6 text-\[#4C6259\]">以下情境取材自門市常見困擾，人物與對話為示意，非特定店家的個案紀錄。<\/p>/);
      const ordered = [guide.title, guide.disclosure!, ...(guide.showSummary === false ? [] : [guide.summary]), ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText), ...(section.bullets ?? [])]), ...(guide.conclusion ? [guide.conclusion] : []), ...(guide.callToAction.heading ? [guide.callToAction.heading] : []), guide.callToAction.text];
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
    const ordered = [guide.title, guide.disclosure!, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), ...(guide.callToAction.heading ? [guide.callToAction.heading] : []), guide.callToAction.text];
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

  it("publishes only the approved v5 leave/reschedule manuscript with one article CTA", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const guide = findPublicGuide(notificationSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    const manuscript = [guide.title, guide.disclosure, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.text, `${guide.callToAction.label}\n${guide.callToAction.url}`].join("\n\n") + "\n";
    // Exact UTF-8 approved v5 first-page manuscript; private SEO/product-gap appendix is excluded.
    expect(createHash("sha256").update(manuscript).digest("hex")).toBe("9c9a961e180c9543ac1c64d91c6ea7d2a8e3b2aec28af768513cc490dc9b4e42");
    expect(guide.sections).toHaveLength(3);
    expect(guide.showSummary).toBe(false);
    const html = renderToStaticMarkup(await GuideArticle(props(notificationSlug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    expect(article.match(/href="https:\/\/www\.steamfoot\.com\/apply"/g)).toHaveLength(1);
    expect(article).toContain("前往蒸管家，了解體驗與適用流程");
    let cursor = 0;
    for (const text of [guide.title, guide.disclosure!, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.text, guide.callToAction.label!]) {
      const position = article.indexOf(text, cursor);
      expect(position, text).toBeGreaterThanOrEqual(cursor);
      cursor = position + text.length;
    }
    expect(article).not.toContain(guide.summary);
    expect(article).not.toContain("申請免費試用 30 天");
    expect(article).not.toMatch(/搜尋量|SEO|熱門搜尋|自動搬家|無痛|永久保留|產品缺口|待驗證|CourseCoachNotification/);
    expect(article).toContain("以下為匿名示意情境，非特定店家的事件或老師訪談原話。");
    expect(article).toContain("每一次人工提醒，都要有人記得、有人傳送");
    expect(article).toContain("哪些已送出、哪些失敗需要補聯絡");
    expect(article).toContain("訊息送出，不代表對方已收到或看過；已讀，也不等於已確認新的安排");
    expect(article).toContain("以上為選型評估方向，實際功能與通知條件以試用確認為準");
    const retiredSlug = "music-school-system-data-migration";
    expect(findPublicGuide(retiredSlug)).toBeUndefined();
    expect(route(`/guides/${retiredSlug}`).status).toBe(404);
    expect(PUBLISHED_GUIDE_PATHS).not.toContain(`/guides/${retiredSlug}`);
    expect(html).toContain('href="/pricing/features/music"');
    expect(route(`/guides/${notificationSlug}`).status).toBe(200);
    expect(route(`/guides/${notificationSlug}`).headers.get("x-robots-tag")).toBeNull();
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${notificationSlug}`);
    const index = renderToStaticMarkup(await GuideIndex({ searchParams: Promise.resolve({}) }));
    expect(index).toContain(`href="/guides/${notificationSlug}"`);
    expect(index).toContain(guide.summary);
    for (const previous of visiblePublicGuides().filter(item => item.id !== notificationSlug && item.id !== pilatesSlug && item.id !== teacherFeeSlug && item.id !== renewalSlug && item.id !== handoverSlug && item.id !== permissionsSlug && item.id !== "sports-studio-business-metrics" && item.id !== "music-fitness-studio-student-loyalty" && item.id !== "paid-members-attendance-drop-follow-up" && !editorialGuides.some(guide => guide.id === item.id))) {
      const previousHtml = renderToStaticMarkup(await GuideArticle(props(previous.id)));
      expect(previousHtml).toContain("申請免費試用 30 天 →");
      expect(previousHtml).not.toContain("前往蒸管家，了解體驗與適用流程");
    }
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(notificationSlug))).robots).toEqual({ index: false, follow: false });
  });

  it("publishes the exact approved Pilates v2 body, one neutral trial CTA, and no private appendix", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const guide = findPublicGuide(pilatesSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    const manuscript = [guide.title, guide.disclosure, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.text, guide.callToAction.label, guide.callToAction.url].join("\n\n") + "\n";
    expect(createHash("sha256").update(manuscript).digest("hex")).toBe("89d02e68129cee51e07a25038895e21c8697579d30ccc2901b5448b38a4154d0");
    expect(guide.sections).toHaveLength(3);
    expect(guide.showSummary).toBe(false);
    const html = renderToStaticMarkup(await GuideArticle(props(pilatesSlug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    expect(article.match(/href="https:\/\/www\.steamfoot\.com\/apply"/g)).toHaveLength(1);
    expect(guide.callToAction.label).toBe("申請蒸管家 30 天免費體驗");
    let cursor = 0;
    for (const text of [guide.title, guide.disclosure!, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.text, guide.callToAction.label!]) {
      const position = article.indexOf(text, cursor);
      expect(position, text).toBeGreaterThanOrEqual(cursor);
      cursor = position + text.length;
    }
    expect(article).not.toContain(guide.summary);
    expect(article).not.toMatch(/SEO|附錄|搜尋量|自動阻擋|零衝突|永久保留|免費無限/);
    expect(article).toContain("註：以下為匿名示意情境，非特定教室的實際事件。");
    expect(article).toContain("這半小時要同時用五台床，只有四台就排不下");
    expect(article).toContain("管好一堂課的人數上限，和管好每台器械的占用，是不同的事");
    expect(article).toContain("再決定是否申請體驗");
    expect(html).toContain('href="/pricing/features/fitness"');
    expect(route(`/guides/${pilatesSlug}`).status).toBe(200);
    expect(route(`/guides/${pilatesSlug}`).headers.get("x-robots-tag")).toBeNull();
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${pilatesSlug}`);
    const index = renderToStaticMarkup(await GuideIndex({ searchParams: Promise.resolve({}) }));
    expect(index).toContain(`href="/guides/${pilatesSlug}"`);
    expect(index).toContain(guide.summary);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(pilatesSlug))).robots).toEqual({ index: false, follow: false });
  });

  it("publishes only the approved teacher-fee body, in order, with exact SEO and destination links", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const guide = findPublicGuide(teacherFeeSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    const ordered = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText), ...(section.bullets ?? []), ...(section.trailingParagraphs ?? [])]), guide.callToAction.heading!, guide.callToAction.text, `${guide.callToAction.termsText}${guide.callToAction.termsLinkLabel}。`, guide.callToAction.label!];
    expect(createHash("sha256").update(ordered.join("\n\n") + "\n").digest("hex")).toBe("e04a79912d61cb329807616d499927177ca522070a6790353541fb70861c1319");
    const html = renderToStaticMarkup(await GuideArticle(props(teacherFeeSlug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    const text = article.replace(/<[^>]*>/g, "");
    let cursor = 0;
    for (const paragraph of ordered) {
      const position = text.indexOf(paragraph, cursor);
      expect(position, paragraph).toBeGreaterThanOrEqual(cursor);
      cursor = position + paragraph.length;
    }
    expect(article.match(/href="https:\/\/www\.steamfoot\.com\/apply"/g)).toHaveLength(1);
    expect(article).toContain('href="/pricing"');
    expect(html).toContain('href="/pricing/features/music"');
    expect(html).toContain("了解音樂教室功能與適用範圍");
    expect(article).not.toMatch(/發布欄位|校稿重點|選題依據|Search Console|GSC|Keyword Planner|搜尋量|自動算代課費|改舊課同步重算/);
    expect(article).not.toContain(guide.summary);
    expect(await generateMetadata(props(teacherFeeSlug))).toMatchObject({ title: "音樂教室老師鐘點費怎麼核對？代課與拆帳管理｜蒸管家", description: guide.summary, alternates: { canonical: `https://www.steamfoot.com/guides/${teacherFeeSlug}` }, robots: { index: true, follow: true } });
    expect(route(`/guides/${teacherFeeSlug}`).status).toBe(200);
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${teacherFeeSlug}`);
  });

  it("publishes the approved renewal manuscript without its editorial appendix", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const guide = findPublicGuide(renewalSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    const ordered = [guide.title, guide.disclosure!, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.heading!, guide.callToAction.text, guide.callToAction.termsText!];
    expect(createHash("sha256").update(ordered.join("\n\n") + "\n").digest("hex")).toBe("2d1a3db20900a92f666c3e6ca75decd9acadff112a2f103cf04449af6d0abbe3");
    const html = renderToStaticMarkup(await GuideArticle(props(renewalSlug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    const text = article.replace(/<[^>]*>/g, "");
    let cursor = 0;
    for (const paragraph of ordered) {
      const position = text.indexOf(paragraph, cursor);
      expect(position, paragraph).toBeGreaterThanOrEqual(cursor);
      cursor = position + paragraph.length;
    }
    expect(article).toContain("</h1><p class=\"mt-3 text-sm leading-6 text-[#4C6259]\">文中人物與對話為示意情境，不對應特定教室。</p>");
    expect(article).not.toContain(guide.summary);
    expect(article).not.toMatch(/附錄|編輯設定|查核依據|實測搜尋量|Keyword Planner|永久保存/);
    expect(article.match(/href="https:\/\/www\.steamfoot\.com\/apply"/g)).toHaveLength(1);
    expect(article).toContain('href="/pricing"');
    expect(html).toContain('href="/pricing/features/music"');
    expect(await generateMetadata(props(renewalSlug))).toMatchObject({ title: guide.seoTitle, description: guide.summary, alternates: { canonical: `https://www.steamfoot.com/guides/${renewalSlug}` }, robots: { index: true, follow: true } });
    expect(route(`/guides/${renewalSlug}`).status).toBe(200);
    expect(route(`/guides/${renewalSlug}`).headers.get("x-robots-tag")).toBeNull();
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${renewalSlug}`);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(renewalSlug))).robots).toEqual({ index: false, follow: false });
  });

  it("publishes the approved fitness handover manuscript with its product boundary and CTA", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const guide = findPublicGuide(handoverSlug)!;
    expect(guide.format).toBe("article");
    if (guide.format !== "article") return;
    const ordered = [guide.title, ...guide.introduction, ...guide.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraphText)]), guide.callToAction.heading!, guide.callToAction.text, guide.callToAction.termsText!];
    expect(createHash("sha256").update(ordered.join("\n\n") + "\n").digest("hex")).toBe("bff7376b85ade01a4c4f48454c58bb5a9766168e566b7018e15145e8dd9b3d48");
    const html = renderToStaticMarkup(await GuideArticle(props(handoverSlug)));
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    const text = article.replace(/<[^>]*>/g, "");
    let cursor = 0;
    for (const paragraph of ordered) {
      const position = text.indexOf(paragraph, cursor);
      expect(position, paragraph).toBeGreaterThanOrEqual(cursor);
      cursor = position + paragraph.length;
    }
    expect(article).not.toContain(guide.summary);
    expect(article).not.toMatch(/附錄|搜尋量|熱門|永久保留|自動追蹤|交接簽收/);
    expect(article).toContain("以上是虛構的匿名示意情境，不對應特定店家或真實成果。");
    expect(article).toContain("若還需要代課媒合或線上交接確認，也要另行核對支援範圍");
    expect(article.match(/href="https:\/\/www\.steamfoot\.com\/apply"/g)).toHaveLength(1);
    expect(article).toContain('href="/pricing"');
    expect(article).toContain("填寫店家需求");
    expect(html).toContain('href="/pricing/features/fitness"');
    expect(await generateMetadata(props(handoverSlug))).toMatchObject({ title: guide.seoTitle, description: guide.summary, alternates: { canonical: `https://www.steamfoot.com/guides/${handoverSlug}` }, robots: { index: true, follow: true } });
    expect(route(`/guides/${handoverSlug}`).status).toBe(200);
    expect(route(`/guides/${handoverSlug}`).headers.get("x-robots-tag")).toBeNull();
    expect(PUBLISHED_GUIDE_PATHS).toContain(`/guides/${handoverSlug}`);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await generateMetadata(props(handoverSlug))).robots).toEqual({ index: false, follow: false });
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
    expect(deployment.main).toBe(false);
  });

  it("uses per-article canonical, metadata, and truthful structured data without invented authors/dates", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const guide of visiblePublicGuides()) {
      const metadata = await generateMetadata(props(guide.id));
      expect(metadata.title).toBe(guide.seoTitle ?? `${guide.title}｜蒸管家經營指南`);
      expect(metadata.description).toBe(guide.summary);
      expect(metadata.alternates?.canonical).toBe(`https://www.steamfoot.com${guidePath(guide)}`);
      expect(metadata.robots).toEqual({ index: true, follow: true });
      const html = renderToStaticMarkup(await GuideArticle(props(guide.id)));
      const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)![1]);
      expect(schema["@graph"][0]).toMatchObject({ "@type": "Article", headline: guide.title });
      expect(schema["@graph"][1].itemListElement[2].item).toBe(`https://www.steamfoot.com${guidePath(guide)}`);
      expect(schema["@graph"][0]).not.toHaveProperty("author");
      if (guide.publishedDate) expect(schema["@graph"][0].datePublished).toBe(guide.publishedDate);
      else expect(schema["@graph"][0]).not.toHaveProperty("datePublished");
      expect(schema["@graph"][0]).not.toHaveProperty("dateModified");
    }
  });

  it("advertises only published public article URLs and no drafts, tokens, or private manuals", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const xml = await sitemap(new Request("https://www.steamfoot.com/sitemap.xml?token=secret")).text();
    const rules = await robots(new Request("https://www.steamfoot.com/robots.txt")).text();
    expect(PUBLISHED_GUIDE_PATHS).toHaveLength(20 + editorialGuides.filter(guide => guide.status === "published").length);
    expect([...xml.matchAll(/<loc>/g)]).toHaveLength(12 + PUBLISHED_GUIDE_PATHS.length);
    expect(xml).not.toContain("/pricing/features/services");
    for (const modulePath of ["slots", "music", "fitness"]) {
      expect(xml).toContain(`<loc>https://www.steamfoot.com/pricing/features/${modulePath}</loc>`);
    }
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

