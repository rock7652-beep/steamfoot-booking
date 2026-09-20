import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
vi.mock("@/lib/permissions", () => ({ isStaffRole: () => false }));
import { proxy } from "@/proxy";

const route = proxy as unknown as (request: NextRequest & { auth: null }) => NextResponse;
function request(path: string) {
  const req = new NextRequest(`https://preview.example${path}`) as NextRequest & { auth: null };
  req.auth = null;
  return route(req);
}
afterEach(() => vi.unstubAllEnvs());
describe("isolated course mobile review routing", () => {
  it("serves only named static review files on preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(request("/course-mobile-review/demo.html").headers.get("x-middleware-next")).toBe("1");
    for (const file of ["navigation.html", "navigation.css", "navigation.js"]) {
      expect(request(`/course-mobile-review/${file}`).headers.get("x-middleware-next")).toBe("1");
    }
    expect(request("/course-mobile-review/private.png").status).toBe(404);
    expect(request("/course-mobile-review/api/book").status).toBe(404);
  });
  it("preserves comparison query when opening the directory", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(request("/course-mobile-review/?role=coach").headers.get("location"))
      .toBe("https://preview.example/course-mobile-review/index.html?role=coach");
  });
  it("does not expose the review in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(request("/course-mobile-review/demo.html").status).toBe(404);
    expect(request("/course-mobile-review/").status).toBe(404);
    for (const file of ["navigation.html", "navigation.css", "navigation.js"]) {
      expect(request(`/course-mobile-review/${file}`).status).toBe(404);
    }
  });
  it("keeps unauthenticated store admin and unrelated paths protected", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(request("/s/course-e2e-20260916/admin/dashboard").headers.get("location"))
      .toContain("/hq/login");
    expect(request("/course-mobile-review-other").headers.get("location"))
      .toContain("/s/zhubei");
  });
});

describe("LINE onboarding guide preview access", () => {
  it("allows both public guides and illustrations only on preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    for (const file of ["store.html", "coordinator.html", "step-1.svg", "step-9.svg"]) {
      expect(request(`/line-onboarding-preview/${file}`).headers.get("x-middleware-next")).toBe("1");
    }
    for (const file of ["README.md", "private.json", "admin/dashboard", "step-10.svg"]) {
      expect(request(`/line-onboarding-preview/${file}`).status).toBe(404);
    }
    expect(request("/s/steam500-liff-pilot/admin/dashboard").headers.get("location"))
      .toContain("/hq/login?store=steam500-liff-pilot");
  });
  it("does not publish the guides on production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const file of ["store.html", "coordinator.html", "step-1.svg"]) {
      expect(request(`/line-onboarding-preview/${file}`).status).toBe(404);
    }
  });
});
