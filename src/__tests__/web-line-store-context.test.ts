import { describe, expect, it, vi } from "vitest";
import { withWebLineStoreContext } from "@/lib/line-oauth/web-store-context";
const origin = "https://preview.example.com";
function request(callbackUrl: string, path = "/api/auth/signin/line") {
  return new Request(origin + path, { method: "POST", body: new URLSearchParams({ callbackUrl, csrfToken: "test-csrf" }) });
}
describe("web LINE store handoff", () => {
  it.each(["Zhubei", "hsinchu", "taichung"])("sets validated %s without a client cookie and preserves state", async slug => {
    const handler = vi.fn(async (req: Request) => {
      expect((await req.formData()).get("csrfToken")).toBe("test-csrf");
      return new Response("oauth", { headers: { "Set-Cookie": "state=test; Secure; HttpOnly" } });
    });
    const resolve = vi.fn(async (value: string) => ({ slug: value }));
    const result = await withWebLineStoreContext(request(`/s/${slug}/book`), handler, resolve);
    expect(resolve).toHaveBeenCalledWith(slug.toLowerCase());
    expect(result.headers.getSetCookie()).toHaveLength(2);
    expect(result.headers.getSetCookie()[1]).toContain(`oauth-store-slug=${slug.toLowerCase()};`);
    expect(result.headers.getSetCookie()[1]).toContain("SameSite=None; Secure");
    expect(await result.text()).toBe("oauth");
  });
  it("accepts the exact store-scoped SPA work callback", async () => {
    const handler = vi.fn(async () => new Response("oauth"));
    const resolve = vi.fn(async (value: string) => ({ slug: value }));
    const result = await withWebLineStoreContext(request("/s/spa-module-qa-20260903/liff/spa-work"), handler, resolve);
    expect(result.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith("spa-module-qa-20260903");
    expect(result.headers.getSetCookie()[0]).toContain("oauth-store-slug=spa-module-qa-20260903;");
  });
  it("clones immutable Auth.js responses before adding the store cookie", async () => {
    const upstream = Response.redirect("https://access.line.me/oauth2/v2.1/authorize", 302);
    // Response.redirect headers are immutable in the Fetch implementation.
    expect(() => upstream.headers.append("Set-Cookie", "test=1")).toThrow();
    const handler = vi.fn(async () => upstream);
    const result = await withWebLineStoreContext(
      request("/s/spa-module-qa-20260903/liff/spa-work"),
      handler,
      async value => ({ slug: value }),
    );
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe("https://access.line.me/oauth2/v2.1/authorize");
    expect(result.headers.getSetCookie()[0]).toContain("oauth-store-slug=spa-module-qa-20260903");
  });
  it.each([
    "/s/spa-module-qa-20260903/liff",
    "/s/spa-module-qa-20260903/liff/spa-work/other",
    "/s/spa-module-qa-20260903/admin/dashboard",
  ])("rejects non-allowlisted store callback %s", async callback => {
    const handler = vi.fn();
    const result = await withWebLineStoreContext(request(callback), handler, async value => ({ slug: value }));
    expect(result.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });
  it.each(["https://evil.example/s/zhubei/book", "/book", "/s/%2F/book", ""])("rejects invalid hint %s", async callback => {
    const handler = vi.fn();
    const result = await withWebLineStoreContext(request(callback), handler, async () => null);
    expect(result.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });
  it("rejects unknown stores without default fallback", async () => {
    const handler = vi.fn();
    expect((await withWebLineStoreContext(request("/s/unknown/book"), handler, async () => null)).status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });
  it.each(["/api/auth/callback/liff-token", "/api/auth/signin/google", "/api/auth/callback/line"])("leaves %s untouched", async path => {
    const response = new Response("unchanged");
    const resolve = vi.fn();
    expect(await withWebLineStoreContext(request("", path), async () => response, resolve)).toBe(response);
    expect(resolve).not.toHaveBeenCalled();
  });
});

it("preserves the exact purchase callback and rejects nested purchase paths", async () => {
  const handler = vi.fn(async () => new Response("oauth"));
  const resolve = vi.fn(async (slug: string) => ({ slug }));
  const path = "/s/hsinchu/liff/wallets/shop/ck0000000000000000000003";
  expect((await withWebLineStoreContext(request(path), handler, resolve)).status).toBe(200);
  expect(resolve).toHaveBeenCalledWith("hsinchu");
  expect((await withWebLineStoreContext(request(path + "/other"), handler, resolve)).status).toBe(400);
  expect((await withWebLineStoreContext(request("https://evil.example" + path), handler, resolve)).status).toBe(400);
});
