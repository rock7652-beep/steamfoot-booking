import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectivePlanLimits } from "@/lib/effective-plan-limits";
import { getPlanFeatures, getPlanLimits, PLAN_LIMITS } from "@/lib/feature-flags";
import { MUSIC_OPENING_BRANCH, MUSIC_OPENING_STORE } from "../../scripts/music-opening-preview-scope.mjs";

// Synthetic URL fixtures only: never connect, query, or read a credential file.
const direct = "postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const pooled = "postgresql://postgres.ttworfzgwejdeolegkxl@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const safe = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: MUSIC_OPENING_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: pooled, DIRECT_URL: direct, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
};
const store = {
  id: MUSIC_OPENING_STORE, plan: "EXPERIENCE" as const, planStatus: "ACTIVE",
  planEffectiveAt: null, planExpiresAt: null,
  maxStaffOverride: null, maxCustomersOverride: null, maxMonthlyBookingsOverride: null,
  maxMonthlyReportsOverride: null, maxReminderSendsOverride: null, maxStoresOverride: null,
};
beforeEach(() => { for (const [key, value] of Object.entries(safe)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());

describe("server-only exact music Preview subscription quotas", () => {
  it("changes exactly staff and monthly bookings, leaving the isomorphic plan and stored inputs untouched", () => {
    const before = structuredClone(store), plans = structuredClone(PLAN_LIMITS), features = getPlanFeatures(store.plan);
    const baseline = getPlanLimits(store);
    expect(baseline.maxStaff).toBe(3); expect(baseline.maxMonthlyBookings).toBe(100);
    expect(getEffectivePlanLimits(store)).toEqual({ ...baseline, maxStaff: null, maxMonthlyBookings: null });
    expect(store).toEqual(before); expect(PLAN_LIMITS).toEqual(plans);
    expect(getPlanLimits(store)).toEqual(baseline); expect(getPlanFeatures(store.plan)).toEqual(features);
  });
  it("preserves all unrelated overrides and dated trial behavior", () => {
    for (const candidate of [
      { ...store, maxStaffOverride: 7, maxMonthlyBookingsOverride: 8, maxCustomersOverride: 9, maxMonthlyReportsOverride: 10, maxReminderSendsOverride: 11, maxStoresOverride: 12 },
      { ...store, planStatus: "TRIAL", planEffectiveAt: new Date("2026-10-01"), planExpiresAt: new Date("2026-10-30") },
    ]) expect(getEffectivePlanLimits(candidate)).toEqual({ ...getPlanLimits(candidate), maxStaff: null, maxMonthlyBookings: null });
  });
  it.each(["store-other-music", "store-lubymusic-copy", "store-zhubei", "__all__", ""])("retains the native quotas for %s", id => {
    const candidate = { ...store, id };
    expect(getEffectivePlanLimits(candidate)).toEqual(getPlanLimits(candidate));
  });
  it.each(["main", "feat/sports-shared-card-controls-20261007", "feat/other", ""])("never grants unlimited merely from matching the isolated database on %s", branch => {
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch);
    expect(getEffectivePlanLimits(store)).toEqual(getPlanLimits(store));
  });
  it("keeps the same store ID native on production main and in local environments", () => {
    vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@db.production.invalid/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://postgres@db.production.invalid/postgres");
    expect(getEffectivePlanLimits(store)).toEqual(getPlanLimits(store));
    for (const key of Object.keys(safe)) vi.stubEnv(key, undefined);
    expect(getEffectivePlanLimits(store)).toEqual(getPlanLimits(store));
  });
  it.each(["VERCEL", "VERCEL_ENV", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "DATABASE_URL", "DIRECT_URL"])("fails closed for a claimed music deployment with missing %s", key => {
    vi.stubEnv(key, undefined);
    expect(() => getEffectivePlanLimits(store)).toThrow();
  });
  it.each([
    ["VERCEL", "true"], ["VERCEL_ENV", "production"], ["VERCEL_GIT_REPO_OWNER", "other-owner"],
    ["VERCEL_GIT_REPO_SLUG", "other-repo"], ["WORKERS_CI_BRANCH", "main"], ["CF_PAGES_BRANCH", "other"],
  ])("fails closed for changed %s without allowing other stores through the malformed scope", (key, value) => {
    vi.stubEnv(key, value);
    expect(() => getEffectivePlanLimits(store)).toThrow();
    expect(() => getEffectivePlanLimits({ ...store, id: "other-store" })).toThrow();
  });
  it.each(["WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("rejects a music claim under %s even without a Vercel branch", key => {
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", undefined); vi.stubEnv(key, MUSIC_OPENING_BRANCH);
    expect(() => getEffectivePlanLimits(store)).toThrow();
  });
  it.each(["DATABASE_URL", "DIRECT_URL"])("validates exact project, path, port and query options for %s", key => {
    for (const value of [
      "postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres",
      direct.replace(".co/", ".co.attacker.invalid/"), direct.replace("/postgres", "/other"),
      direct + "?host=other.invalid", direct + "?%68ost=other.invalid", direct + "?options=-csearch_path=other",
      direct + "?schema=other", direct + "?schema=public&schema=public", direct + "?connection_limit=zero",
      direct + "?unknown=1", direct + "#ignored", direct.replace("/postgres", ":6543/postgres"),
    ]) { vi.stubEnv(key, value); expect(() => getEffectivePlanLimits(store)).toThrow(); }
  });
  it("rejects both wrong connections and never logs or exposes the supplied URL", () => {
    const secret = "postgresql://redaction-marker@db.wrong.invalid/postgres";
    vi.stubEnv("DATABASE_URL", secret); vi.stubEnv("DIRECT_URL", secret);
    const log = vi.spyOn(console, "log"), warn = vi.spyOn(console, "warn"), error = vi.spyOn(console, "error");
    try { getEffectivePlanLimits(store); throw new Error("expected scope rejection"); }
    catch (e) { expect((e as Error).message).not.toContain(secret); expect((e as Error).message).not.toContain("redaction-marker"); }
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("does not grant a unit-test bypass and preserves explicit legacy baselines", () => {
    const legacy = { ...PLAN_LIMITS.EXPERIENCE, maxStaff: 17, maxCustomers: 29 };
    expect(getEffectivePlanLimits(store, legacy)).toEqual({ ...legacy, maxStaff: null, maxMonthlyBookings: null });
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL", undefined);
    expect(() => getEffectivePlanLimits(store)).toThrow();
  });
  it("keeps environment resolution out of the shared client plan module and native SPA booking gate", () => {
    const code = readFileSync("src/lib/effective-plan-limits.ts", "utf8");
    expect(code).toMatch(/^import "server-only"/);
    expect(code).not.toMatch(/NEXT_PUBLIC_|console\.|@\/lib\/(db|course-db|spa-db)/);
    expect(readFileSync("src/lib/feature-flags.ts", "utf8")).not.toMatch(/effective-plan-limits|process\.env|MUSIC_OPENING/);
    const spa = readFileSync("src/server/actions/spa-booking.ts", "utf8");
    expect(spa).toContain("getPlanLimits(store).maxMonthlyBookings"); expect(spa).not.toContain("getEffectivePlanLimits");
  });
});
