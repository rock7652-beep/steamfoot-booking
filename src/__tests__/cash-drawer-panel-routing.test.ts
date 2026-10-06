import { describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
vi.mock("@/lib/permissions", () => ({ isStaffRole: () => true }));
import { proxy } from "@/proxy";

type User = { role: string; storeId?: string; storeSlug?: string };
const route = proxy as unknown as (request: NextRequest & { auth: { user: User } | null }) => NextResponse;
function request(path: string, user: User | null = null) {
  const req = new NextRequest(`https://preview.example${path}`) as NextRequest & { auth: { user: User } | null };
  req.auth = user ? { user } : null;
  return route(req);
}
describe("cash drawer lightweight document", () => {
  it("retains scoped headers and query for HQ and store panels", () => {
    for (const [prefix, user] of [
      ["/hq", { role: "ADMIN" }],
      ["/s/test/admin", { role: "STAFF", storeId: "a", storeSlug: "test" }],
    ] as const) {
      const path = `${prefix}/dashboard/cash-drawer`;
      const response = request(`${path}?cashDrawerPanel=1&panelStoreId=a`, user);
      expect(response.headers.get("x-middleware-rewrite")).toBe("https://preview.example/cash-drawer-panel?cashDrawerPanel=1&panelStoreId=a");
      expect(response.headers.get("x-middleware-request-x-next-pathname")).toBe(path);
      if (prefix !== "/hq") expect(response.headers.get("x-middleware-request-x-store-slug")).toBe("test");
    }
  });
  it("retains ordinary full-page navigation", () => {
    expect(request("/hq/dashboard/cash-drawer", { role: "ADMIN" }).headers.get("x-middleware-rewrite"))
      .toBe("https://preview.example/dashboard/cash-drawer");
  });
  it("rejects unauthenticated, wrong-role and direct internal requests", () => {
    expect(request("/hq/dashboard/cash-drawer?cashDrawerPanel=1").headers.get("location")).toContain("/hq/login");
    expect(request("/s/test/admin/dashboard/cash-drawer?cashDrawerPanel=1").headers.get("location")).toContain("/hq/login");
    expect(request("/hq/dashboard/cash-drawer?cashDrawerPanel=1", { role: "STAFF", storeId: "a", storeSlug: "test" }).headers.get("x-middleware-rewrite")).toBeNull();
    expect(request("/cash-drawer-panel?cashDrawerPanel=1", { role: "ADMIN" }).status).toBe(404);
  });
});
