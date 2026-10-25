import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/beauty/public-booking-preview", () => ({ BeautyPublicBookingPreview: () => null }));
import Page from "@/app/beauty-public-preview/page";
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/beauty-public-booking-ux");
  vi.stubEnv("VERCEL_GIT_REPO_OWNER", "rock7652-beep"); vi.stubEnv("VERCEL_GIT_REPO_SLUG", "steamfoot-booking");
});
afterEach(() => vi.unstubAllEnvs());
it("renders the synthetic review only for the exact Preview branch and repository", () => { expect(Page()).toBeTruthy(); });
it.each([
  ["VERCEL_ENV", "production"], ["VERCEL_ENV", ""],
  ["VERCEL_GIT_COMMIT_REF", "main"], ["VERCEL_GIT_COMMIT_REF", "another-branch"],
  ["VERCEL_GIT_REPO_OWNER", "other"], ["VERCEL_GIT_REPO_SLUG", "other"],
])("rejects %s=%s rather than exposing a mock booking on production", (key, value) => {
  vi.stubEnv(key, value); expect(Page).toThrow("NOT_FOUND");
});
