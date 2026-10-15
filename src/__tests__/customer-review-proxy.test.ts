vi.mock("@/lib/retired-store-boundary", () => ({ retiredStoreBoundary: () => null }));
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const m = vi.hoisted(() => ({ authenticated: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: () => m.authenticated }));
vi.mock("@/lib/permissions", () => ({ isStaffRole: vi.fn() }));
import { proxy } from "@/proxy";
const runProxy = proxy as unknown as (req: NextRequest) => NextResponse;

beforeEach(() => {
  vi.clearAllMocks();
  m.authenticated.mockReturnValue(new NextResponse("Authentication required", { status: 401 }));
  for (const [key, value] of Object.entries({
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/customer-unified-detail-20261012",
    VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
    DATABASE_URL: "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
    DIRECT_URL: "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
    CONSULTATION_PREVIEW_INTAKE_ENABLED: "false", CUSTOMER_REVIEW_TOKEN_SHA256: "a".repeat(64),
    CUSTOMER_REVIEW_ISSUED_AT: String(Date.now() - 1000), CUSTOMER_REVIEW_EXPIRES_AT: String(Date.now() + 60_000),
  })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
function request(path: string, method = "GET") {
  return new NextRequest(`https://preview.example${path}`, { method, headers: { "x-store-slug": "forged" } });
}
it("passes only the exact valid GET entry before normal login routing, with clean context and no-store", () => {
  const result = runProxy(request("/preview-review"));
  expect(result.headers.get("x-middleware-next")).toBe("1");
  expect(result.headers.get("x-middleware-request-x-store-slug")).toBeNull();
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  expect(m.authenticated).not.toHaveBeenCalled();
});
it("keeps dashboard and auth routes behind their existing routing", () => {
  expect(runProxy(request("/hq/dashboard")).status).toBe(401);
  expect(m.authenticated).toHaveBeenCalledTimes(1);
});
it.each(["production", "development"])("hides the entry outside preview: %s", mode => {
  vi.stubEnv("VERCEL_ENV", mode);
  expect(runProxy(request("/preview-review")).status).toBe(404);
  expect(m.authenticated).not.toHaveBeenCalled();
});
it("rejects expired entry, descendant paths and POST before auth", () => {
  expect(runProxy(request("/preview-review/extra")).status).toBe(404);
  expect(runProxy(request("/preview-review", "POST")).status).toBe(405);
  vi.stubEnv("CUSTOMER_REVIEW_EXPIRES_AT", String(Date.now() - 1));
  expect(runProxy(request("/preview-review")).status).toBe(404);
  expect(m.authenticated).not.toHaveBeenCalled();
});
