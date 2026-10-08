import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { GET as robots } from "@/app/robots.txt/route";
import { GET as sitemap } from "@/app/sitemap.xml/route";
import { MARKETING_ORIGIN, MARKETING_SITEMAP_PATHS, marketingMetadata } from "@/lib/marketing-seo";
import { MARKETING_LEGACY_PATHS, marketingRoute } from "@/lib/marketing-routes";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import { config, proxy } from "@/proxy";

const request = (path: string, host = "www.steamfoot.com") => new Request(`https://${host}${path}`);
const route = (path: string, host = "www.steamfoot.com") => {
  const req = new NextRequest(`https://${host}${path}`, { headers: { host } });
  Object.assign(req, { auth: null });
  return (proxy as unknown as (req: NextRequest) => Response)(req);
};
afterEach(() => vi.unstubAllEnvs());

describe("public crawler documents", () => {
  it.each(["/robots.txt", "/sitemap.xml", "/robots.txt?x=1", "/sitemap.xml?x=1"])("bypasses auth only for %s", url => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    expect(route(url).headers.get("x-middleware-next")).toBe("1");
    expect(route(url).headers.get("location")).toBeNull();
  });
  it.each(["/robots.txt/private", "/sitemap.xml/private", "/robots.txtx", "/sitemap.xmlx", "/s/zhubei/robots.txt", "/hq/dashboard", "/s/zhubei/admin/dashboard", "/liff", "/line-oauth/complete", "/api/auth/session"])("retains proxy protection/dispatch for %s", url => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });
  it("serves anonymous production robots as text, allowing only exact public pages", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = robots(request("/robots.txt"));
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(result.headers.get("location")).toBeNull();
    const text = await result.text();
    expect(text).toContain("Disallow: /\n");
    for (const path of MARKETING_SITEMAP_PATHS) expect(text).toContain(`Allow: ${path}$\n`);
    for (const path of MARKETING_LEGACY_PATHS) expect(text).toContain(`Allow: ${path}$\n`);
    for (const asset of ["/_next/static/", "/_next/image", "/pricing/business-assets/", "/pricing/brand/"]) expect(text).toContain(`Allow: ${asset}\n`);
    expect(text).toContain(`Sitemap: ${MARKETING_ORIGIN}/sitemap.xml`);
  });
  it("uses the real request Host even when Next supplies an internal origin", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const req = new Request("http://localhost:3000/sitemap.xml", { headers: { host: "www.steamfoot.com" } });
    expect(await sitemap(req).text()).toContain("<loc>https://www.steamfoot.com/</loc>");
    const foreign = new Request("https://www.steamfoot.com/sitemap.xml", { headers: { host: "example.vercel.app" } });
    expect(await sitemap(foreign).text()).not.toContain("<loc>");
    const spoofed = new Request("https://example.vercel.app/sitemap.xml", { headers: { host: "example.vercel.app", "x-forwarded-host": "www.steamfoot.com" } });
    expect(await sitemap(spoofed).text()).not.toContain("<loc>");
    const uppercase = new Request("http://localhost/sitemap.xml", { headers: { host: "WWW.STEAMFOOT.COM" } });
    expect(await sitemap(uppercase).text()).toContain("<loc>");
  });
  it("lists unique canonical public destinations with real files and no redirects", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = sitemap(request("/sitemap.xml?token=do-not-echo"));
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(result.headers.get("location")).toBeNull();
    const xml = await result.text();
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    expect(urls).toEqual(MARKETING_SITEMAP_PATHS.map(path => `${MARKETING_ORIGIN}${path}`));
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      const path = new URL(url).pathname;
      const mapped = marketingRoute(path);
      expect(mapped?.kind).not.toBe("redirect");
      const source = (mapped?.destination ?? path).replace(/^(\/pricing\/guides)\/[^/]+$/, "$1/[slug]");
      expect(existsSync(`src/app${source}/page.tsx`) || existsSync(`public${source}`)).toBe(true);
      expect(route(path).headers.get("location")).toBeNull();
    }
    expect(xml).not.toMatch(/token=|\/s\/|\/hq|\/api|\/liff|preview|\/entry|pricing\/business|pricing\/guides/);
  });
  it.each(["preview", "development", ""])("disables indexing in %s without needing secrets", async env => {
    vi.stubEnv("VERCEL_ENV", env);
    expect(await robots(request("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
    expect(await sitemap(request("/sitemap.xml")).text()).not.toContain("<loc>");
    expect(marketingMetadata("/").robots).toEqual({ index: false, follow: false });
    expect(route("/guides").headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
  it.each(["steamfoot-zhubei.com", "www.steamfoot-zhubei.com", "example.vercel.app", "attacker.example", "steamfoot.com", "www.steamfoot.com:3000", "www.steamfoot.com.attacker.example"])("never advertises marketing sitemap on %s", async host => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await robots(request("/robots.txt", host)).text()).not.toContain("Sitemap:");
    expect(await sitemap(request("/sitemap.xml", host)).text()).not.toContain("<loc>");
    expect(route("/guides", host).headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(route("/pricing/features", host).headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
  it("enables production canonical metadata without broadening access", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(marketingMetadata("/")).toEqual({ alternates: { canonical: `${MARKETING_ORIGIN}/` }, robots: { index: true, follow: true } });
    expect(route("/guides").headers.get("x-robots-tag")).toBeNull();
    expect(route("/guides/private").status).toBe(404);
    expect(route("/guides/private/admin").headers.get("location")).toContain("/s/zhubei/");
    expect(route("/hq/dashboard").headers.get("location")).toContain("/hq/login");
    expect(route("/s/zhubei/admin/dashboard").headers.get("location")).toBeTruthy();
    expect(route("/", "steamfoot-zhubei.com").headers.get("location")).toBe("https://steamfoot-zhubei.com/s/zhubei/");
  });
  it("wires canonical/index metadata into each public page without changing root metadata", () => {
    for (const path of MARKETING_SITEMAP_PATHS) {
      const destination = (marketingRoute(path)?.destination ?? path).replace(/^(\/pricing\/guides)\/[^/]+$/, "$1/[slug]");
      if (destination.endsWith(".html")) {
        expect(readFileSync(`public${destination}`, "utf8")).toContain(`<link rel="canonical" href="${MARKETING_ORIGIN}${path}">`);
      } else {
        const source = readFileSync(`src/app${destination}/page.tsx`, "utf8");
        if (destination.includes("[slug]")) {
          expect(source).toContain("...marketingMetadata(guidePath(guide))");
        } else {
          expect(source).toContain(`...marketingMetadata("${path}")`);
          expect(source).not.toMatch(/robots:\s*\{/);
        }
      }
    }
    expect(readFileSync("src/app/layout.tsx", "utf8")).not.toContain("marketingMetadata");
  });
  it("sets noindex headers for all Preview responses while leaving production headers alone", async () => {
    const { default: nextConfig } = await import("../../next.config");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await nextConfig.headers!()).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await nextConfig.headers!()).toEqual([]);
  });
  it("publishes the review branch with automatic deployment disabled and both build paths guarded", () => {
    const branch = "fix/public-seo-crawlers-20261007";
    expect(JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled[branch]).toBe(false);
    for (const path of ["scripts/ci-migrate.mjs", "next.config.ts"]) {
      const source = readFileSync(path, "utf8");
      expect(source.indexOf(`.includes("${branch}")`)).toBeLessThan(source.indexOf("import "));
      expect(source).toContain("SEO review branch deployment is disabled");
      const guard = new Function("process", source.slice(0, source.indexOf("import ")));
      for (const key of ["VERCEL_GIT_COMMIT_REF", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"]) {
        expect(() => guard({ env: { [key]: branch } })).toThrow("SEO review branch deployment is disabled");
      }
      expect(() => guard({ env: { VERCEL_GIT_COMMIT_REF: "main", VERCEL_ENV: "production" } })).not.toThrow();
    }
    expect(readFileSync("next.config.ts", "utf8")).toContain('key: "X-Robots-Tag", value: "noindex, nofollow"');
  });
});
