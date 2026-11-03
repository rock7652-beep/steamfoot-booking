import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
vi.mock("@/lib/permissions", () => ({ isStaffRole: () => false }));
import { proxy } from "@/proxy";
const route = proxy as unknown as (request: NextRequest) => NextResponse;
const request = (path = "/beauty-public-preview", method = "GET") => route(new NextRequest(`https://preview.example${path}`, { method }));
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/beauty-public-booking-ux");
  vi.stubEnv("VERCEL_GIT_REPO_OWNER", "rock7652-beep"); vi.stubEnv("VERCEL_GIT_REPO_SLUG", "steamfoot-booking");
});
afterEach(() => vi.unstubAllEnvs());
it("serves the synthetic preview before default-store redirects, without accepting writes or nested routes", () => {
  expect(request().headers.get("x-middleware-next")).toBe("1");
  expect(request().headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  expect(request(undefined, "HEAD").status).toBe(200);
  expect(request(undefined, "POST").status).toBe(405);
  expect(request("/beauty-public-preview/private").status).toBe(404);
});
it.each([["VERCEL_ENV", "production"], ["VERCEL_GIT_COMMIT_REF", "main"], ["VERCEL_GIT_REPO_OWNER", "other"], ["VERCEL_GIT_REPO_SLUG", "other"]])("hides the review when %s=%s", (key, value) => {
  vi.stubEnv(key, value); expect(request().status).toBe(404);
});
