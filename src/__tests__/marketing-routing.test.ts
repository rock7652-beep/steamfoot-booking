import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import { proxy } from "@/proxy";

function route(path: string, role?: string, host = "www.steamfoot.com") {
  const req = new NextRequest(`https://${host}${path}`, { headers: { host } });
  Object.assign(req, { auth: role ? { user: { role, storeSlug: "taichung", storeId: "store-2" } } : null });
  return (proxy as unknown as (req: NextRequest) => Response)(req);
}

describe("marketing URLs preserve store routing", () => {
  it.each([undefined, "CUSTOMER", "OWNER", "ADMIN"])("serves homepage regardless of session %s", (role) => {
    const r = route("/?utm_source=line", role);
    expect(r.headers.get("x-middleware-rewrite")).toBe("https://www.steamfoot.com/pricing/business?utm_source=line");
  });
  it.each([
    ["/pricing/business", "/"], ["/pricing/cases", "/cases"],
    ["/pricing/guides", "/guides"], ["/pricing/apply.html", "/apply"],
    ["/pricing/terms.html", "/terms"], ["/pricing/refunds.html", "/refunds"],
  ])("redirects %s and serves %s without a redirect loop", (old, current) => {
    const r = route(`${old}?store=nuanmu&utm_source=line`);
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe(`https://www.steamfoot.com${current}?store=nuanmu&utm_source=line`);
    expect(route(current).headers.get("x-middleware-rewrite")).toBe(`https://www.steamfoot.com${old}`);
  });
  it.each(["zhubei", "hsinchu", "taichung"])("keeps %s login and customer destinations", (slug) => {
    expect(route(`/s/${slug}/`).headers.get("x-middleware-rewrite")).toBe("https://www.steamfoot.com/");
    expect(route(`/s/${slug}/`).headers.get("x-middleware-request-x-store-slug")).toBe(slug);
    expect(route(`/s/${slug}/book`).headers.get("location")).toBe(`https://www.steamfoot.com/s/${slug}/`);
    expect(route(`/s/${slug}/book`, "CUSTOMER").headers.get("x-middleware-rewrite")).toBe("https://www.steamfoot.com/book");
    expect(route(`/s/${slug}/liff`).headers.get("x-middleware-rewrite")).toBe("https://www.steamfoot.com/liff");
  });
  it("retains role-based auth return and error parameters", () => {
    expect(route("/entry?error=AccessDenied").headers.get("location")).toBe("https://www.steamfoot.com/s/zhubei/?error=AccessDenied");
    expect(route("/entry", "CUSTOMER").headers.get("location")).toBe("https://www.steamfoot.com/s/taichung/book");
    expect(route("/entry", "OWNER").headers.get("location")).toBe("https://www.steamfoot.com/s/taichung/admin/dashboard");
    expect(route("/entry", "ADMIN").headers.get("location")).toBe("https://www.steamfoot.com/hq/dashboard");
  });
  it.each(["/api/auth/callback/line", "/api/line-oauth/taichung/callback", "/line-oauth/complete", "/oauth-confirm", "/hq/login", "/pricing/submit", "/pricing/business-assets/example.png"])("does not redirect %s into marketing", (path) => {
    const r = route(path);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("preserves dedicated store domain root", () => {
    expect(route("/", undefined, "steamfoot-zhubei.com").headers.get("location")).toBe("https://steamfoot-zhubei.com/s/zhubei/");
  });
});
