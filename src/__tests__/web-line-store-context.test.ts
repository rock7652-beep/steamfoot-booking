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
    expect(await result.text()).toBe("oauth");
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
