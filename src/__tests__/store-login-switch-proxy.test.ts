import { describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
vi.mock("@/lib/permissions", () => ({ isStaffRole: (role: string) => ["OWNER", "PARTNER", "STAFF", "ADMIN"].includes(role) }));
import { proxy } from "@/proxy";
function run(path: string, role = "OWNER", slug = "store-b") {
  const req = new NextRequest(`https://preview.example${path}`);
  Object.assign(req, { auth: { user: { role, storeId: "id-b", storeSlug: slug } } });
  return (proxy as unknown as (req: NextRequest) => NextResponse)(req);
}
describe("explicit store login with an existing session", () => {
  it("shows login instead of sending a different store session into a forbidden dashboard", () => {
    expect(run("/hq/login?store=store-a").headers.get("x-middleware-next")).toBe("1");
  });
  it("keeps same-store and default redirects for existing Steamfoot, SPA and course staff", () => {
    for (const slug of ["steamfoot-store", "spa-store", "course-store"]) {
      for (const path of ["/hq/login", `/hq/login?store=${slug}`]) {
        expect(run(path, "OWNER", slug).headers.get("location")).toBe(`https://preview.example/s/${slug}/admin/dashboard`);
      }
    }
  });
  it("retains HQ admin redirect and server authorization for direct store routes", () => {
    expect(run("/hq/login?store=store-a", "ADMIN").headers.get("location")).toBe("https://preview.example/hq/dashboard");
    expect(run("/s/store-a/admin/dashboard").headers.get("x-middleware-rewrite")).toContain("/dashboard");
  });
});
