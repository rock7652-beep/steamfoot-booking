import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), authenticated: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth", () => ({ auth: () => mocks.authenticated }));
import { proxy } from "@/proxy";

function request(path: string, cookie?: string, method = "GET", host = "www.steamfoot.com") {
  return new NextRequest(`https://${host}${path}`, { method, headers: { host, ...(cookie ? { cookie } : {}) } });
}
async function route(req: NextRequest): Promise<Response> {
  const response = await proxy(req as Parameters<typeof proxy>[0], {} as Parameters<typeof proxy>[1]);
  if (!(response instanceof Response)) throw new Error("Expected a proxy response");
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({ industryModule: "SPA" });
  mocks.authenticated.mockReturnValue(NextResponse.next());
});

describe("retired store request boundary", () => {
  it.each(["/s/legacy-spa/", "/s/legacy-spa/book", "/s/legacy-spa/register", "/s/legacy-spa/liff", "/s/legacy-spa/admin/dashboard", "/s/legacy-spa/admin/dashboard/customers", "/hq/login?store=legacy-spa"])("returns a controlled 410 for %s before auth and shared rendering", async path => {
    const response = await route(request(path));
    expect(response.status).toBe(410);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.text()).toContain("此模組已停用");
    expect(mocks.authenticated).not.toHaveBeenCalled();
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { slug: "legacy-spa" }, select: { industryModule: true } });
  });

  it("rejects Server Action posts without executing the authenticated route", async () => {
    expect((await route(request("/s/legacy-spa/admin/dashboard/settings", undefined, "POST"))).status).toBe(410);
    expect(mocks.authenticated).not.toHaveBeenCalled();
  });

  it("recovers a retired HQ selection without exposing downstream dashboard data", async () => {
    const response = await route(request("/hq/dashboard/customers", "active-store-id=archived-spa; store-slug=legacy-spa"));
    expect(response.status).toBe(410);
    expect(response.headers.get("set-cookie")).toContain("active-store-id=;");
    expect(await response.text()).toContain('href="/hq/login"');
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "archived-spa" }, select: { industryModule: true } });
    expect(mocks.authenticated).not.toHaveBeenCalled();
  });

  it.each(["/hq/dashboard/operation-audits?module=SPA", "/dashboard/operation-audits?module=SPA", "/hq/dashboard/stores/archived-spa", "/hq/dashboard/stores/archived-spa/features"])("preserves authentication and historical access on %s", async path => {
    const response = await route(request(path, "active-store-id=__all__"));
    expect(response.status).toBe(200);
    expect(mocks.authenticated).toHaveBeenCalledOnce();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("keeps HQ store metadata paths available even with a retired selection", async () => {
    await route(request("/hq/dashboard/stores/archived-spa/features", "active-store-id=archived-spa"));
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.authenticated).toHaveBeenCalledOnce();
  });

  it.each(["STEAMFOOT", "COURSE"])("preserves %s routing and authorization", async industryModule => {
    mocks.findUnique.mockResolvedValue({ industryModule });
    const response = await route(request("/s/active-store/admin/dashboard"));
    expect(response.status).toBe(200);
    expect(mocks.authenticated).toHaveBeenCalledOnce();
  });

  it("leaves unknown stores to the existing not-found and auth policy", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await route(request("/s/unknown/"));
    expect(mocks.authenticated).toHaveBeenCalledOnce();
  });

  it("uses the real URL rather than forged route headers or stale cookies", async () => {
    const req = request("/s/actual-store/", "store-slug=other-store; active-store-id=other-store");
    req.headers.set("x-store-slug", "other-store");
    await route(req);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { slug: "actual-store" }, select: { industryModule: true } });
  });

  it("also protects the configured store-domain root", async () => {
    expect((await route(request("/", undefined, "GET", "steamfoot-zhubei.com"))).status).toBe(410);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "e182e256-98ca-4c78-970b-d4b118066c51" }, select: { industryModule: true } });
  });

  it("does not report transient database failures as module retirement or grant access", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database unavailable"));
    await expect(route(request("/s/any-store/"))).rejects.toThrow("database unavailable");
    expect(mocks.authenticated).not.toHaveBeenCalled();
  });
});
