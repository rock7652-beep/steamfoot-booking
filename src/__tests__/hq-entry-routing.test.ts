import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import { proxy } from "@/proxy";

function route(path: string, user: Record<string, unknown> | null) {
  const request = new NextRequest(`https://www.steamfoot.com${path}`);
  Object.assign(request, { auth: user ? { user } : null });
  return (proxy as unknown as (req: NextRequest) => Response)(request);
}

describe("HQ entry and store chooser routing", () => {
  it("serves the HQ trial inbox without rewriting it to a nonexistent shared page", () => {
    const response = route("/hq/dashboard/trial-applications?application=test-id", { role: "ADMIN" });
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
  it("requires login for the trial inbox", () => {
    expect(route("/hq/dashboard/trial-applications", null).headers.get("location")).toBe("https://www.steamfoot.com/hq/login");
  });
  it("keeps store owners outside the HQ trial inbox", () => {
    expect(route("/hq/dashboard/trial-applications", { role: "OWNER", storeId: "store-1", storeSlug: "taichung" }).headers.get("location")).toBe("https://www.steamfoot.com/s/taichung/admin/dashboard");
  });
  it("returns signed-out users to backend login", () => {
    expect(route("/store-select", null).headers.get("location")).toBe("https://www.steamfoot.com/hq/login");
  });
  it("returns headquarters admins to their dashboard without requiring a store", () => {
    expect(route("/store-select", { role: "ADMIN" }).headers.get("location")).toBe("https://www.steamfoot.com/hq/dashboard");
  });
  it("returns store staff to their own dashboard", () => {
    expect(route("/store-select", { role: "OWNER", storeId: "store-1", storeSlug: "taichung" }).headers.get("location")).toBe("https://www.steamfoot.com/s/taichung/admin/dashboard");
  });
  it("does not invent a store for staff with missing context", () => {
    expect(route("/store-select", { role: "OWNER" }).headers.get("location")).toBe("https://www.steamfoot.com/hq/login?error=missing-store");
  });
  it("keeps the chooser available to customers", () => {
    expect(route("/store-select", { role: "CUSTOMER" }).headers.get("location")).toBeNull();
  });
  it.each(["/hq/login", "/hq/login?store=zhubei"])("allows a customer session to open %s and sign in as staff", (path) => {
    expect(route(path, { role: "CUSTOMER", storeId: "store-1", storeSlug: "zhubei" }).headers.get("location")).toBeNull();
  });
  it("still sends an authenticated HQ admin directly to the dashboard", () => {
    expect(route("/hq/login", { role: "ADMIN" }).headers.get("location")).toBe("https://www.steamfoot.com/hq/dashboard");
  });
});
