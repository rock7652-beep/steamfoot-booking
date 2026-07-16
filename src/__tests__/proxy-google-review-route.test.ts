import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: (handler: unknown) => handler,
}));

vi.mock("@/lib/permissions", () => ({
  isStaffRole: () => false,
}));

type ProxyFn = (request: NextRequest & { auth: null }) => Response;
let runProxy: ProxyFn;

function request(path: string): NextRequest & { auth: null } {
  const req = new NextRequest(`https://example.com${path}`) as NextRequest & { auth: null };
  Object.defineProperty(req, "auth", { value: null });
  return req;
}

describe("proxy Google review public route", () => {
  beforeAll(async () => {
    const proxyModule = await import("@/proxy");
    runProxy = proxyModule.proxy as unknown as ProxyFn;
  });

  it("allows the exact /s/[slug]/google-review route without login redirect", () => {
    const response = runProxy(request("/s/zhubei/google-review?i=token-1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not make nested google-review paths public", () => {
    const response = runProxy(request("/s/zhubei/google-review/private"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/s/zhubei/");
  });

  it("keeps another protected customer route behind login", () => {
    const response = runProxy(request("/s/zhubei/book"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/s/zhubei/");
  });
});
