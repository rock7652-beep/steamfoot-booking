import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolveLoginAcceptanceLiffId } from "@/lib/liff/member-login-acceptance-preview";
const db = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
beforeEach(() => {
  for (const [key, value] of Object.entries({ VERCEL: "1", VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "fix/new-member-purchase-login-check-20261026",
    VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
    DATABASE_URL: db, DIRECT_URL: db, STEAMFOOT_TRIAL_ACCEPTANCE_LIFF_ID: "2010761154-TrialTest",
    STEAMFOOT_MEMBER_ACCEPTANCE_LIFF_ID: "2010761154-MemberTest", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "" })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
it("selects only the two nonsecret LIFF IDs on the exact isolated branch", () => {
  expect(resolveLoginAcceptanceLiffId("zhubei", "trial")).toBe("2010761154-TrialTest");
  expect(resolveLoginAcceptanceLiffId("zhubei", "member")).toBe("2010761154-MemberTest");
  expect(resolveLoginAcceptanceLiffId("hsinchu", "member")).toBeNull();
});
it.each(["production", "development"])("never changes LIFF mappings in %s", environment => {
  vi.stubEnv("VERCEL_ENV", environment);
  expect(resolveLoginAcceptanceLiffId("zhubei", "member")).toBeNull();
});
it("never enables a different branch", () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
  expect(resolveLoginAcceptanceLiffId("zhubei", "member")).toBeNull();
});
it.each(["DATABASE_URL", "DIRECT_URL"])("refuses a non-isolated %s", key => {
  vi.stubEnv(key, db.replace("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf"));
  expect(() => resolveLoginAcceptanceLiffId("zhubei", "member")).toThrow();
});
it("refuses an unexpected Login channel", () => {
  vi.stubEnv("STEAMFOOT_MEMBER_ACCEPTANCE_LIFF_ID", "otherchannel-Test");
  expect(() => resolveLoginAcceptanceLiffId("zhubei", "member")).toThrow();
});
