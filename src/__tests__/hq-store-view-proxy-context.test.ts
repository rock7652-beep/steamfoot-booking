import { describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
vi.mock("@/lib/permissions", () => ({
  isStaffRole: (role: string) => ["ADMIN", "OWNER", "MANAGER", "STAFF", "PARTNER"].includes(role),
}));

import { proxy } from "@/proxy";

function request(path: string, method = "GET") {
  const req = new NextRequest(`https://preview.example${path}`, {
    method,
    headers: {
      "x-next-pathname": "/s/attacker-store/admin/dashboard",
      "x-store-slug": "attacker-store",
      cookie: "active-store-id=selected-store; authjs.session-token=session",
      "next-action": "action-reference",
      "content-type": "application/json",
      origin: "https://preview.example",
    },
  });
  Object.assign(req, { auth: { user: { id: "hq", role: "ADMIN", storeId: null, staffId: null } } });
  return (proxy as unknown as (value: NextRequest) => NextResponse)(req);
}

function expectVerifiedNonStoreContext(response: NextResponse, pathname: string) {
  expect(response.headers.get("x-middleware-request-x-next-pathname")).toBe(pathname);
  expect(response.headers.get("x-middleware-request-x-store-slug")).toBeNull();
  expect(response.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("x-store-slug");
  expect(response.headers.get("x-middleware-request-cookie")).toContain("active-store-id=selected-store");
}

describe("verified request context on every HQ/API pass-through", () => {
  it.each([
    "/api/data-export?storeId=another-store",
    "/api/reports/export?storeId=another-store",
    "/api/reports/store-revenue",
    "/api/reports/coach-revenue",
    "/api/trial-applications/example/attachments/0",
    "/hq/dashboard/stores",
    "/hq/dashboard/stores/store-a/features",
    "/hq/dashboard/trial-applications",
    "/hq/other-platform-page",
  ])("overwrites forged store context on %s", path => {
    const response = request(path);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expectVerifiedNonStoreContext(response, path.split("?")[0]);
  });

  it("preserves Server Action transport headers while replacing route claims", () => {
    const response = request("/hq/dashboard/stores/store-a/features", "POST");
    expectVerifiedNonStoreContext(response, "/hq/dashboard/stores/store-a/features");
    expect(response.headers.get("x-middleware-request-next-action")).toBe("action-reference");
    expect(response.headers.get("x-middleware-request-content-type")).toBe("application/json");
    expect(response.headers.get("x-middleware-request-origin")).toBe("https://preview.example");
  });

  it("retains verified HQ rewrite context", () => {
    const response = request("/hq/dashboard/customers");
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://preview.example/dashboard/customers");
    expectVerifiedNonStoreContext(response, "/hq/dashboard/customers");
  });

  it("takes the scoped store exclusively from the actual public route", () => {
    const response = request("/s/store-a/admin/dashboard/customers");
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://preview.example/dashboard/customers");
    expect(response.headers.get("x-middleware-request-x-next-pathname")).toBe("/s/store-a/admin/dashboard/customers");
    expect(response.headers.get("x-middleware-request-x-store-slug")).toBe("store-a");
  });
});
